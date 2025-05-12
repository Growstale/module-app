const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');


const app = express();
const PORT = process.env.PORT || 5001;


mongoose.connect('mongodb://localhost:27017/diagrams', { 
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));


const SchemeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    data: {
        modules: { type: Array, required: true },
        connections: { type: Array, required: true }
    }
}, { timestamps: true });

const Scheme = mongoose.model('Scheme', SchemeSchema);

    
app.use(cors());
app.use(express.json());

function findPathModules(currentId, endId, connections, modules, visited = new Set()) {
    visited.add(currentId); // Отмечаем текущий узел как посещенный

    const connectedConn = connections.find(conn => conn.sourceId === currentId);
    if (!connectedConn) return null; // Нет пути дальше

    const nextModuleId = connectedConn.targetId;
    if (nextModuleId === endId) {
        // Дошли до конца, возвращаем пустой массив (не включаем конечный узел)
        return [];
    }

    if (visited.has(nextModuleId)) {
        console.error(`Cycle detected during path finding at module ${nextModuleId}`);
        return null; // Обнаружен цикл
    }

    const nextModule = modules.find(m => m.instanceId === nextModuleId);
    if (!nextModule) return null; // Следующий модуль не найден

    // Рекурсивно ищем путь от следующего модуля
    const remainingPath = findPathModules(nextModuleId, endId, connections, modules, visited);

    if (remainingPath !== null) {
        // Если путь найден, добавляем текущий *следующий* модуль (nextModule) к нему
        return [nextModule, ...remainingPath];
    } else {
        return null; // Путь от следующего узла не найден
    }
}

function findNextModule(sourceInstanceId, connections, modules) {
    const connection = connections.find(conn => conn.sourceId === sourceInstanceId);
    if (!connection) return null;
    return modules.find(m => m.instanceId === connection.targetId);
  }
  

  function findPreviousModule(targetInstanceId, connections, modules) {
    const connection = connections.find(conn => conn.targetId === targetInstanceId);
    if (!connection) return null;
    return modules.find(m => m.instanceId === connection.sourceId);
}

function findPipeModuleBetween(fromInstanceId, toInstanceId, connections, modules) {
    // 1. Проверяем прямое соединение (если вдруг соединили не через трубу)
    const directConnection = connections.find(c => c.sourceId === fromInstanceId && c.targetId === toInstanceId);
    if (directConnection) {
        // Прямое соединение есть, трубы между ними нет (или она не нужна по логике)
        // console.warn(`Direct connection found between ${fromInstanceId} and ${toInstanceId}. No pipe module assumed.`);
        return null;
    }

    // 2. Ищем соединение через один промежуточный модуль типа 'pipe'
    // Ищем соединение, исходящее из fromInstanceId
    const firstConnection = connections.find(c => c.sourceId === fromInstanceId);
    if (!firstConnection) return null; // Нет исходящего соединения

    // Находим промежуточный модуль
    const intermediateModule = modules.find(m => m.instanceId === firstConnection.targetId);
    // Проверяем, что это труба ('pipe')
    if (!intermediateModule || intermediateModule.type !== 'pipe') {
        return null; // Промежуточный модуль не труба или не найден
    }

    // Ищем второе соединение, которое идет от этой трубы к toInstanceId
    const secondConnection = connections.find(c => c.sourceId === intermediateModule.instanceId && c.targetId === toInstanceId);
    if (secondConnection) {
        // Нашли трубу между двумя модулями
        return intermediateModule;
    }

    // Если не нашли трубу по этому пути, возможно, она идет в другую сторону? (менее вероятно для потока)
    // Можно добавить обратный поиск, если нужно

    return null; // Не нашли трубу между модулями
}


 function calculateVelocity(flowM3s, pipeDiameterM) {
    if (!pipeDiameterM || pipeDiameterM <= 0) return 0;
    const area = Math.PI * Math.pow(pipeDiameterM / 2, 2);
    return flowM3s / area;
}

function calculateHydraulicEfficiency(pumpPressurePa, totalHydraulicLossPa) {
    if (!pumpPressurePa || pumpPressurePa <= 0) return 0; // Давление насоса должно быть > 0
    // Полезное давление не может быть отрицательным
    const usefulPressure = Math.max(0, pumpPressurePa - totalHydraulicLossPa);
    return usefulPressure / pumpPressurePa;
}

function calculateOverallMechanicalEfficiency(modulesInSystem) {
    let overallMechEff = 1.0;
    modulesInSystem.forEach(module => {
        // Учитываем механический КПД насосов и цилиндров
        if ((module.type === 'pump' || module.type === 'cylinder') && module.properties?.mechEff) {
            overallMechEff *= module.properties.mechEff;
        }
        // TODO: Добавить учет КПД других компонентов, если они имеют мех. потери (гидромоторы и т.д.)
    });
    // Ограничиваем минимальное значение, чтобы избежать странных результатов
    return Math.max(0.1, overallMechEff); // Не позволяем КПД быть слишком низким или нулевым
}


function calculateOverallVolumetricEfficiency(modulesInSystem, pumpFlowM3s, drainFlowM3sFromCylinder, cylinderExists, pressurePathCompIds = [], drainPathCompIds = []) {
    let overallVolEff = 1.0;
    console.log(`[Vol.Eff] Starting calculation. Initial overallVolEff: ${overallVolEff}`);
    console.log(`[Vol.Eff] pumpFlowM3s: ${pumpFlowM3s.toExponential(3)}, drainFlowM3sFromCylinder: ${drainFlowM3sFromCylinder.toExponential(3)}, cylinderExists: ${cylinderExists}`);


    // КПД насоса
    const pumpModule = modulesInSystem.find(m => m.type === 'pump');
    if (pumpModule && pumpModule.properties?.volumetricEff) {
        overallVolEff *= pumpModule.properties.volumetricEff;
        console.log(`[Vol.Eff] Pump ${pumpModule.name}: eff ${pumpModule.properties.volumetricEff.toFixed(3)}. Current overallVolEff: ${overallVolEff.toFixed(4)}`);
    }

    // КПД цилиндра
    const cylinderModule = modulesInSystem.find(m => m.type === 'cylinder');
    if (cylinderModule && cylinderModule.properties?.volEff) {
        overallVolEff *= cylinderModule.properties.volEff;
        console.log(`[Vol.Eff] Cylinder ${cylinderModule.name}: eff ${cylinderModule.properties.volEff.toFixed(3)}. Current overallVolEff: ${overallVolEff.toFixed(4)}`);
    }

    // Утечки в других компонентах
    modulesInSystem.forEach(module => {
        // Учитываем только те компоненты, которые не насос и не цилиндр, и имеют свойство утечки
        if (module.type !== 'pump' && module.type !== 'cylinder' && module.properties?.internalLeakage) {
            const leakageLmin = module.properties.internalLeakage;
            if (leakageLmin > 0) {
                const leakageM3s = leakageLmin / 60000;
                let flowThroughComponentM3s = pumpFlowM3s; // Поток по умолчанию - поток насоса

                // Определяем, на какой линии компонент, чтобы взять правильный поток
                if (cylinderExists && drainPathCompIds.includes(module.instanceId)) {
                    flowThroughComponentM3s = drainFlowM3sFromCylinder;
                } else if (pressurePathCompIds.includes(module.instanceId)) {
                    flowThroughComponentM3s = pumpFlowM3s;
                } else if (module.system !== 'common' && module.type !== 'filter') {
                    // Если компонент не "common" (т.е. привязан к системе gns/gru) и не фильтр,
                    // и не нашелся на явных путях к цилиндру, предполагаем, что он на напорной линии до цилиндра/разветвления
                    flowThroughComponentM3s = pumpFlowM3s;
                     console.log(`[Vol.Eff] Component ${module.name} (${module.type}) assumed on pressure path with pump flow.`);
                } else if (module.type === 'filter' && !drainPathCompIds.includes(module.instanceId) && !pressurePathCompIds.includes(module.instanceId)){
                    // Если это фильтр и он не на пути слива/напора (может быть общий фильтр где-то еще)
                    // Для такого случая сложно определить поток без знания полной топологии.
                    // Безопаснее не учитывать его утечку, чем использовать неверный поток.
                    console.warn(`[Vol.Eff] Filter ${module.name} not on main drain/pressure path, its leakage not accounted for in overall volumetric efficiency for simplicity.`);
                    return; // пропустить этот компонент
                }


                if (flowThroughComponentM3s > leakageM3s) {
                    const componentEff = (flowThroughComponentM3s - leakageM3s) / flowThroughComponentM3s;
                    overallVolEff *= componentEff;
                    console.log(`[Vol.Eff] Component ${module.name} (${module.type}): leakage ${leakageLmin.toFixed(3)} L/min, flow ${flowThroughComponentM3s.toExponential(2)} m3/s, eff ${componentEff.toFixed(3)}. Current overallVolEff: ${overallVolEff.toFixed(4)}`);
                } else if (flowThroughComponentM3s > 0) {
                    overallVolEff *= 0; // Весь поток утек
                    console.warn(`[Vol.Eff] Component ${module.name}: leakage (${leakageLmin.toFixed(3)} L/min) >= flow (${flowThroughComponentM3s.toExponential(2)} m3/s). Setting component eff to 0.`);
                } else {
                     // console.warn(`[Vol.Eff] Zero flow through component ${module.name} with leakage. Its vol. efficiency contribution is 1 (no flow, no loss from flow).`);
                }
            }
        }
    });
    const finalOverallVolEff = Math.max(0.1, Math.min(1.0, overallVolEff)); // Ограничиваем 0.1 - 1.0
    console.log(`[Vol.Eff] Final overallVolEff: ${finalOverallVolEff.toFixed(4)}`);
    return finalOverallVolEff;
}




function calculateReynoldsNumber(velocity, diameter, kinematicViscosity) {
    if (!kinematicViscosity || kinematicViscosity <= 0 || !diameter || diameter <= 0) return 0;
    return (velocity * diameter) / kinematicViscosity;
}

function calculateLambda(reynoldsNumber, diameter, roughness) {
    if (reynoldsNumber <= 0) return 0;

    if (reynoldsNumber < 2300) { // Ламинарный режим
        return 75 / reynoldsNumber; // По CSV
    } else { // Турбулентный режим
        const relativeRoughness = roughness / diameter;
        if (reynoldsNumber < 100000) { // Блазиус для гладких труб
             return 0.3164 / Math.pow(reynoldsNumber, 0.25);
        } else { // Альтшуль (упрощенно) для больших Re или шероховатых
             const term = relativeRoughness + 68 / reynoldsNumber;
             return 0.11 * Math.pow(term, 0.25);
        }
    }
}

function calculateFrictionLoss(lambda, length, diameter, density, velocity) {
    if (!diameter || diameter <= 0) return 0;
    return lambda * (length / diameter) * (density * Math.pow(velocity, 2) / 2);
}


function calculateLocalLoss(totalZeta, density, velocity) {
    return totalZeta * (density * Math.pow(velocity, 2) / 2);
}


const operations = {
    'GET_START_VALUE': (currentValue, properties) => {
        const startVal = properties?.startValue;
        if (typeof startVal !== 'number') {
            console.warn(`Start node (ID: ?) missing or invalid 'startValue'. Using 0.`);
            return 0;
        }
        console.log(`Start Node: returning ${startVal}`);
        return startVal;
    },
    'ADD_NUMBER': (currentValue, properties) => {
        const valueToAdd = properties?.valueToAdd ?? 0; 
        if (typeof currentValue !== 'number' || typeof valueToAdd !== 'number') {
             throw new Error("Invalid input for ADD_NUMBER operation.");
        }
        const result = currentValue + valueToAdd;
        console.log(`ADD_NUMBER (${valueToAdd}): ${currentValue} -> ${result}`);
        return result;
    },
    'MULTIPLY_BY': (currentValue, properties) => {
        const factor = properties?.factor ?? 1; 
         if (typeof currentValue !== 'number' || typeof factor !== 'number') {
             throw new Error("Invalid input for MULTIPLY_BY operation.");
        }
        const result = currentValue * factor;
        console.log(`MULTIPLY_BY (${factor}): ${currentValue} -> ${result}`);
        return result;
    },
    'SQUARE': (currentValue, properties) => {
        if (typeof currentValue !== 'number') {
             throw new Error("Invalid input for SQUARE operation.");
        }
        const result = currentValue * currentValue;
        console.log(`SQUARE: ${currentValue} -> ${result}`);
        return result;
    },
    'GET_END_VALUE': (currentValue, properties) => {
        if (typeof currentValue !== 'number') {
             throw new Error("Invalid input for SQUARE operation.");
        }
        const result = currentValue;
        console.log(`END: ${currentValue} -> ${result}`);
        return result;
    }
};

app.post('/api/process-chain', (req, res) => {
    console.log("Received /api/process-chain request");
    try {
        const { modules, connections } = req.body;

        if (!Array.isArray(modules) || !Array.isArray(connections)) {
            console.error("Invalid input data structure");
            return res.status(400).json({ error: "Invalid input: 'modules' and 'connections' must be arrays." });
        }
        if (modules.length === 0) {
             console.warn("Empty modules array received");
             return res.status(400).json({ error: "No modules provided." });
        }

        const startNode = modules.find(m => m.type === 'start');
        const endNode = modules.find(m => m.type === 'end');

        if (!startNode) {
            console.error("Start node not found");
            return res.status(400).json({ error: "Start node not found in the provided modules." });
        }

        if (!endNode) {
            console.error("End node not found");
            return res.status(400).json({ error: "End node not found." });
        }

        const adj = new Map();
        connections.forEach(conn => {
            adj.set(conn.sourceId, conn.targetId);
        });
        console.log("Adjacency Map:", adj);

        let currentNode = startNode;
        let currentValue;
        const visited = new Set(); 
        const maxSteps = modules.length + 1; 
        let steps = 0;
        let chainResult = null; 

        while (currentNode && steps < maxSteps) {
            if (visited.has(currentNode.instanceId)) {
                console.error("Cycle detected!");
                throw new Error("Processing stopped: Cycle detected in the chain.");
            }
            visited.add(currentNode.instanceId);
            steps++;

            const operationKey = currentNode.operationKey; 
            const operationFunc = operations[operationKey];

            console.log(`Processing node: ${currentNode.name} (ID: ${currentNode.instanceId}, Type: ${currentNode.type}, OpKey: ${operationKey})`);

            if (typeof operationFunc !== 'function') {
                console.error(`Unknown operation key: ${operationKey}`);
                throw new Error(`Unknown or unsupported operation: ${operationKey || 'N/A'} for module ${currentNode.name}`);
            }

            try {
                 currentValue = operationFunc(currentValue, currentNode.properties || {});
            } catch (opError) {
                 console.error(`Error during operation ${operationKey} on node ${currentNode.instanceId}:`, opError);
                 throw new Error(`Error in module ${currentNode.name}: ${opError.message}`);
            }


            // --- Переход к следующему узлу ---
            if (currentNode.type === 'end') {
                console.log("Reached End node.");
                chainResult = currentValue; 
                currentNode = null; 
            } else {
                const nextNodeId = adj.get(currentNode.instanceId);
                if (nextNodeId) {
                    const nextNode = modules.find(m => m.instanceId === nextNodeId);
                    if (nextNode) {
                        currentNode = nextNode;
                    } else {
                         console.error(`Next node with ID ${nextNodeId} not found in modules array.`);
                         throw new Error(`Chain broken: Could not find module with ID ${nextNodeId}`);
                    }
                } else {
                     console.warn(`Node ${currentNode.instanceId} has no outgoing connection.`);
                     if (modules.some(m => m.type === 'end')) { // Если End нода вообще есть на схеме
                         throw new Error("Chain broken: Path does not reach the End node.");
                     } else {
                         console.log("Reached the end of a chain without an explicit End node.");
                         chainResult = currentValue;
                         currentNode = null;
                     }

                }
            }
        } 

        if (steps >= maxSteps) {
             console.error("Processing stopped: Maximum steps reached (possible infinite loop without cycle detection).");
             throw new Error("Processing failed: Maximum processing steps exceeded.");
        }

        if (chainResult === null && modules.some(m => m.type === 'end')) {
            console.error("Processing finished without reaching the End node.");
            throw new Error("Failed to reach the End node.");
        }

        console.log("Processing successful. Final result:", chainResult);
        res.status(200).json({ result: chainResult });

    } catch (error) {
        console.error("Error in /api/process-chain:", error);
        res.status(500).json({ error: error.message || "An unexpected server error occurred." });
    }
});

function calculateCylinderPressure(cylinderModule, drainLineLossPa) {
    if (!cylinderModule || !cylinderModule.properties) return 0;

    const props = cylinderModule.properties;
    const forceN = props.force || 0; // Усилие на штоке, Н
    const pistonDiameterM = props.pistonDiameter || 0;
    const rodDiameterM = props.rodDiameter || 0;
    const mechEff = props.mechEff || 0.9; // Механический КПД цилиндра (дефолт 0.9)

    if (forceN <= 0 || pistonDiameterM <= 0 || mechEff <= 0) return 0;

    const pistonAreaM2 = Math.PI * Math.pow(pistonDiameterM / 2, 2);
    const rodAreaM2 = Math.PI * Math.pow(rodDiameterM / 2, 2);
    const rodSideAreaM2 = pistonAreaM2 - rodAreaM2; // Площадь штоковой полости

    // Предполагаем, что при прямом ходе (усилие F на выдвижение)
    // давление в штоковой полости равно потерям в сливной линии
    const pressureRodSidePa = drainLineLossPa;

    // P_поршневая = (F / η_мех + P_шток * A_шток_полова) / A_поршень
    const requiredPistonPressurePa = (forceN / mechEff + pressureRodSidePa * rodSideAreaM2) / pistonAreaM2;

    return requiredPistonPressurePa;
}

app.post('/api/calculate-hydraulics', (req, res) => {
    console.log("Received /api/calculate-hydraulics request");
    try {
      const { modules, connections } = req.body;

      // --- 1. Валидация входных данных ---
      if (!Array.isArray(modules) || modules.length === 0) {
        return res.status(400).json({ error: "Invalid input: 'modules' must be a non-empty array." });
      }
      const engine = modules.find(m => m.type === 'engine_input');
      const tankModule = modules.find(m => m.type === 'tank_output');
      const pumps = modules.filter(m => m.type === 'pump');

      if (!engine) return res.status(400).json({ error: "Engine module not found." });
      if (!tankModule) return res.status(400).json({ error: "Tank module not found on diagram." });
      if (pumps.length === 0) return res.status(400).json({ error: "No pump modules found." });

      // --- 2. Глобальные параметры и свойства жидкости ---
      const fluid = { density: 868, kinematicViscosityM2s: 32 * 1e-6 };
      const environment = { ambientTempC: 30, heatTransferCoeff: 15 };
      const GRAVITY_ACCEL = 9.81;
      const DEFAULT_PIPE_DIAMETER = 0.01;
      const DEFAULT_PIPE_LENGTH = 1.0;
      const DEFAULT_PIPE_ROUGHNESS = 0.00005;

      // --- 3. Определение текущих оборотов двигателя ---
      let currentEngineRpm;
      switch (engine.properties.selectedRpmMode) {
          case 'idleRpm': currentEngineRpm = engine.properties.idleRpm; break;
          case 'maxTorqueRpm': currentEngineRpm = engine.properties.maxTorqueRpm; break;
          case 'nominalRpm': default: currentEngineRpm = engine.properties.nominalRpm; break;
      }
      if (!currentEngineRpm || currentEngineRpm <= 0) { return res.status(400).json({ error: "Invalid engine RPM selected." }); }
      console.log(`Calculating for Engine RPM: ${currentEngineRpm}`);

      // --- 4. Расчет параметров для каждой гидросистемы ---
      const systemResults = {};
      const pumpIds = ['pump_gns_ap30', 'pump_gru_nsh10'];
      let totalHeatGenerated = 0;
      let totalEquipmentSurface = 0;

      // --- НАЧАЛО ЦИКЛА ПО СИСТЕМАМ ---
      for (const pumpId of pumpIds) {
          const pump = modules.find(m => m.id === pumpId);
          if (!pump || !pump.system) { console.warn(`Pump ${pumpId} not found or missing 'system' property. Skipping.`); continue; }

          const systemType = pump.system;
          console.log(`--- Calculating system: ${systemType.toUpperCase()} ---`);
          const results = {
            pumpFlowLmin: 0, pumpFlowM3s: 0,
            velocities: { suction: 0, pressure: 0, drain: 0 },
            losses: {
                friction: { suctionPa: 0, pressurePa: 0, drainPa: 0 }, // Эти будут суммарные потери трения в трубах линии
                local: { suctionPa: 0, pressurePa: 0, drainPa: 0 },    // Эти будут суммарные местные потери в трубах линии
                componentsPressurePa: 0,
                componentsDrainPa: 0,
                totalPressureLineLossMPa: 0,
                totalDrainLineLossMPa: 0
            },
            requiredPumpPressureMPa: 0,
            systemEfficiency: 0, pumpPowerKw: 0, heatGeneratedKw: 0
          };

          // 4.1 Подача насоса
          const pumpRpm = currentEngineRpm * pump.properties.driveRatio;
          const pumpFlowLmin = (pump.properties.workingVolume * pumpRpm * pump.properties.volumetricEff) / 1000;
          const pumpFlowM3s = pumpFlowLmin / (60 * 1000);
          results.pumpFlowLmin = pumpFlowLmin;
          results.pumpFlowM3s = pumpFlowM3s;
          console.log(`${systemType.toUpperCase()} Pump Flow: ${pumpFlowLmin.toFixed(2)} L/min`);

          // 4.2/4.3/4.4 Скорости и ПОТЕРИ
          const cylinder = modules.find(m => m.type === 'cylinder' && m.system === systemType);
          let pressureLinePipeFrictionPa = 0;
          let pressureLinePipeLocalPa = 0;
          let drainLinePipeFrictionPa = 0;
          let drainLinePipeLocalPa = 0;
          let pressureLineComponentLossPa = 0;
          let drainLineComponentLossPa = 0;

          // -- Всасывающая линия --
          const suctionPath = findPathModules(tankModule.instanceId, pump.instanceId, connections, modules, new Set([tankModule.instanceId])) || [];
          const suctionPipeModule = suctionPath.find(m => m.type === 'pipe');
          let v_suction = 0;
          if (suctionPipeModule) {
              const suctionPipeProps = suctionPipeModule.properties;
              const suctionPipeDiameter = suctionPipeProps?.diameter || DEFAULT_PIPE_DIAMETER;
              const suctionPipeLength = suctionPipeProps?.length || DEFAULT_PIPE_LENGTH;
              const suctionRoughness = suctionPipeProps?.roughness || DEFAULT_PIPE_ROUGHNESS;
              const suctionLocalZetaSum = (suctionPipeProps?.localResistanceCoeff || 0) + 0.5;
              v_suction = calculateVelocity(pumpFlowM3s, suctionPipeDiameter);
              const re_suction = calculateReynoldsNumber(v_suction, suctionPipeDiameter, fluid.kinematicViscosityM2s);
              const lambda_suction = calculateLambda(re_suction, suctionPipeDiameter, suctionRoughness);
              results.losses.friction.suctionPa = parseFloat(calculateFrictionLoss(lambda_suction, suctionPipeLength, suctionPipeDiameter, fluid.density, v_suction).toFixed(0));
              results.losses.local.suctionPa = parseFloat(calculateLocalLoss(suctionLocalZetaSum, fluid.density, v_suction).toFixed(0));
              console.log(`[${systemType.toUpperCase()}] Suction line using pipe ${suctionPipeModule.name} (Ø${suctionPipeDiameter*1000}mm, L=${suctionPipeLength}m)`);
              console.log(`[${systemType.toUpperCase()}] Suction: V=${v_suction.toFixed(3)} m/s, Re=${re_suction.toFixed(0)}, λ=${lambda_suction.toFixed(4)}, ΔPf=${results.losses.friction.suctionPa}Pa, ΔPl=${results.losses.local.suctionPa}Pa (Σξ=${suctionLocalZetaSum.toFixed(2)})`);
          } else {
              v_suction = calculateVelocity(pumpFlowM3s, DEFAULT_PIPE_DIAMETER); // Скорость для дефолтной трубы
              console.warn(`[${systemType.toUpperCase()}] Suction pipe module not found. Using default values.`);
          }
          results.velocities.suction = parseFloat(v_suction.toFixed(3));


          // --- Напорная и Сливная линии ---
          let pressureLinePathModules = [];
          let drainLinePathModules = [];
          if (cylinder) {
            pressureLinePathModules = findPathModules(pump.instanceId, cylinder.instanceId, connections, modules, new Set([pump.instanceId])) || [];
            drainLinePathModules = findPathModules(cylinder.instanceId, tankModule.instanceId, connections, modules, new Set([cylinder.instanceId])) || [];
          }

          // -- Напорная линия (трубы) --
          let v_pressure = 0;
          let pressurePipeDiameterForLambda = DEFAULT_PIPE_DIAMETER;
          let pressureRoughnessForLambda = DEFAULT_PIPE_ROUGHNESS;
          let pressureLineTotalLocalZetaFromPipes = 0;

          const pipesOnPressurePath = pressureLinePathModules.filter(m => m.type === 'pipe');
          if (pipesOnPressurePath.length > 0) {
              console.log(`[${systemType.toUpperCase()}] Pressure line path pipes:`, pipesOnPressurePath.map(p => p.name));
              pressurePipeDiameterForLambda = pipesOnPressurePath[0].properties?.diameter || DEFAULT_PIPE_DIAMETER;
              pressureRoughnessForLambda = pipesOnPressurePath[0].properties?.roughness || DEFAULT_PIPE_ROUGHNESS;
              console.log(`[${systemType.toUpperCase()}] Pressure line using Ø${(pressurePipeDiameterForLambda*1000).toFixed(0)}mm from ${pipesOnPressurePath[0].name} for Lambda calc.`);

              v_pressure = calculateVelocity(pumpFlowM3s, pressurePipeDiameterForLambda); // Общая скорость для линии по первому диаметру
              const re_pressure_line = calculateReynoldsNumber(v_pressure, pressurePipeDiameterForLambda, fluid.kinematicViscosityM2s);
              const lambda_pressure_line = calculateLambda(re_pressure_line, pressurePipeDiameterForLambda, pressureRoughnessForLambda);

              pipesOnPressurePath.forEach(pipe => {
                  const pipeProps = pipe.properties;
                  const pipeL = pipeProps?.length || DEFAULT_PIPE_LENGTH;
                  const pipeD_actual = pipeProps?.diameter || DEFAULT_PIPE_DIAMETER;
                  const v_segment = calculateVelocity(pumpFlowM3s, pipeD_actual); // Скорость в этом сегменте

                  pressureLinePipeFrictionPa += calculateFrictionLoss(lambda_pressure_line, pipeL, pipeD_actual, fluid.density, v_segment); // Используем lambda линии, но фактический D и v сегмента
                  pressureLinePipeLocalPa += calculateLocalLoss(pipeProps?.localResistanceCoeff || 0, fluid.density, v_segment); // Только ξ самой трубы
              });
              pressureLinePipeLocalPa += calculateLocalLoss(1.5, fluid.density, v_pressure); // Добавляем общие 1.5 для линии
              console.log(`[${systemType.toUpperCase()}] Pressure Line PIPE Totals: V_avg=${v_pressure.toFixed(3)} m/s, ΣΔPf=${pressureLinePipeFrictionPa.toFixed(0)}Pa, ΣΔPl (pipes+line)=${pressureLinePipeLocalPa.toFixed(0)}Pa`);
          } else if (cylinder) {
              console.warn(`[${systemType.toUpperCase()}] No pipes found on pressure line path. Using default values for losses.`);
              v_pressure = calculateVelocity(pumpFlowM3s, DEFAULT_PIPE_DIAMETER);
              pressureLinePipeLocalPa = calculateLocalLoss(1.5, fluid.density, v_pressure); // Только общие для линии
          }
          results.velocities.pressure = parseFloat(v_pressure.toFixed(3));
          results.losses.friction.pressurePa = parseFloat(pressureLinePipeFrictionPa.toFixed(0));
          results.losses.local.pressurePa = parseFloat(pressureLinePipeLocalPa.toFixed(0));


          // -- Сливная линия (трубы) --
          let v_drain = 0;
          let drainFlowM3s = pumpFlowM3s;
          if (cylinder && cylinder.properties) {
              const D_piston = cylinder.properties.pistonDiameter; const d_rod = cylinder.properties.rodDiameter;
              if (D_piston && D_piston > 0) {
                  const pistonArea = Math.PI * Math.pow(D_piston/2,2); const rodArea = Math.PI * Math.pow(d_rod/2,2);
                  drainFlowM3s = pumpFlowM3s * (pistonArea - rodArea) / pistonArea;
                  console.log(`[${systemType.toUpperCase()}] Calculated drain flow from cylinder: ${drainFlowM3s.toExponential(3)} m³/s (${(drainFlowM3s*60000).toFixed(2)} L/min)`);
              } else { console.warn(`[${systemType.toUpperCase()}] Cylinder piston diameter invalid for drain flow. Using pump flow.`); }
          }
          let drainPipeDiameterForLambda = DEFAULT_PIPE_DIAMETER;
          let drainRoughnessForLambda = DEFAULT_PIPE_ROUGHNESS;
          let drainLineTotalLocalZetaFromPipes = 0;

          const pipesOnDrainPath = drainLinePathModules.filter(m => m.type === 'pipe');
          if (pipesOnDrainPath.length > 0) {
              console.log(`[${systemType.toUpperCase()}] Drain line path pipes:`, pipesOnDrainPath.map(p => p.name));
              drainPipeDiameterForLambda = pipesOnDrainPath[0].properties?.diameter || DEFAULT_PIPE_DIAMETER;
              drainRoughnessForLambda = pipesOnDrainPath[0].properties?.roughness || DEFAULT_PIPE_ROUGHNESS;
              console.log(`[${systemType.toUpperCase()}] Drain line using Ø${(drainPipeDiameterForLambda*1000).toFixed(0)}mm from ${pipesOnDrainPath[0].name} for Lambda calc.`);

              v_drain = calculateVelocity(drainFlowM3s, drainPipeDiameterForLambda); // Общая скорость по первому диаметру
              const re_drain_line = calculateReynoldsNumber(v_drain, drainPipeDiameterForLambda, fluid.kinematicViscosityM2s);
              const lambda_drain_line = calculateLambda(re_drain_line, drainPipeDiameterForLambda, drainRoughnessForLambda);

              pipesOnDrainPath.forEach(pipe => {
                  const pipeProps = pipe.properties;
                  const pipeL = pipeProps?.length || DEFAULT_PIPE_LENGTH;
                  const pipeD_actual = pipeProps?.diameter || DEFAULT_PIPE_DIAMETER;
                  const v_seg = calculateVelocity(drainFlowM3s, pipeD_actual);

                  drainLinePipeFrictionPa += calculateFrictionLoss(lambda_drain_line, pipeL, pipeD_actual, fluid.density, v_seg);
                  drainLinePipeLocalPa += calculateLocalLoss(pipeProps?.localResistanceCoeff || 0, fluid.density, v_seg);
              });
              drainLinePipeLocalPa += calculateLocalLoss(1.0, fluid.density, v_drain); // Общие 1.0 для линии
              console.log(`[${systemType.toUpperCase()}] Drain Line PIPE Totals: V_avg=${v_drain.toFixed(3)} m/s, ΣΔPf=${drainLinePipeFrictionPa.toFixed(0)}Pa, ΣΔPl (pipes+line)=${drainLinePipeLocalPa.toFixed(0)}Pa`);
          } else if (cylinder) {
              console.warn(`[${systemType.toUpperCase()}] No pipes found on drain line path. Using default values for losses.`);
              v_drain = calculateVelocity(drainFlowM3s, DEFAULT_PIPE_DIAMETER);
              drainLinePipeLocalPa = calculateLocalLoss(1.0, fluid.density, v_drain);
          }
          results.velocities.drain = parseFloat(v_drain.toFixed(3));
          results.losses.friction.drainPa = parseFloat(drainLinePipeFrictionPa.toFixed(0));
          results.losses.local.drainPa = parseFloat(drainLinePipeLocalPa.toFixed(0));


          // --- Потери в компонентах ---
          console.log(`[${systemType.toUpperCase()}] Component loss calculation - STARTED`);
          const pressurePathCompInstanceIds = pressureLinePathModules.filter(m => m.type !== 'pipe').map(m => m.instanceId);
          const drainPathCompInstanceIds = drainLinePathModules.filter(m => m.type !== 'pipe').map(m => m.instanceId);
          const componentsForLossCalc = modules.filter(m =>
              m.type !== 'pipe' && m.type !== 'pump' && m.type !== 'cylinder' &&
              m.type !== 'tank_output' && m.type !== 'engine_input' &&
              (m.system === systemType || m.system === 'common')
          );
          console.log(`[${systemType.toUpperCase()}] Components considered for losses:`, componentsForLossCalc.map(m => `${m.name} (${m.type}) - ${m.instanceId}`));

          componentsForLossCalc.forEach(comp => {
              const nominalLossMPa = comp.properties?.pressureDrop || 0;
              const nominalCompFlowLmin = comp.properties?.nominalFlowLmin || 0;
              if (nominalLossMPa > 0 && nominalCompFlowLmin > 0) {
                  const nominalCompFlowM3s = nominalCompFlowLmin / 60000;
                  let actualFlowThroughCompM3s = pumpFlowM3s;
                  if (cylinder && drainPathCompInstanceIds.includes(comp.instanceId)) { actualFlowThroughCompM3s = drainFlowM3s; }
                  const lossPa = nominalLossMPa * 1e6 * Math.pow(actualFlowThroughCompM3s / nominalCompFlowM3s, 2);
                  if (pressurePathCompInstanceIds.includes(comp.instanceId)) { pressureLineComponentLossPa += lossPa; }
                  else if (drainPathCompInstanceIds.includes(comp.instanceId)) { drainLineComponentLossPa += lossPa; }
                  else { pressureLineComponentLossPa += lossPa; console.warn(`[${systemType.toUpperCase()}] Common component ${comp.name} loss added to pressure line.`); }
                  console.log(`[${systemType.toUpperCase()}] Loss for ${comp.name}: ${(lossPa/1e6).toFixed(3)} MPa (Nom. Loss: ${nominalLossMPa} MPa at ${nominalCompFlowLmin} L/min, Actual Flow: ${(actualFlowThroughCompM3s*60000).toFixed(1)} L/min)`);
              } else if (nominalLossMPa > 0) {
                  if (pressurePathCompInstanceIds.includes(comp.instanceId)) { pressureLineComponentLossPa += nominalLossMPa * 1e6; }
                  else if (drainPathCompInstanceIds.includes(comp.instanceId)) { drainLineComponentLossPa += nominalLossMPa * 1e6; }
                  else { pressureLineComponentLossPa += nominalLossMPa * 1e6; }
                  console.warn(`[${systemType.toUpperCase()}] Using nominal loss for ${comp.name} (${nominalLossMPa} MPa) due to missing nominalFlowLmin.`);
              }
          });
          results.losses.componentsPressurePa = parseFloat(pressureLineComponentLossPa.toFixed(0));
          results.losses.componentsDrainPa = parseFloat(drainLineComponentLossPa.toFixed(0));
          console.log(`[${systemType.toUpperCase()}] TOTAL Component Losses: Pressure=${pressureLineComponentLossPa.toFixed(0)}Pa, Drain=${drainLineComponentLossPa.toFixed(0)}Pa`);

          // Общие потери линий
          const totalPressureLineLosses = pressureLinePipeFrictionPa + pressureLinePipeLocalPa + pressureLineComponentLossPa;
          const totalDrainLineLosses = drainLinePipeFrictionPa + drainLinePipeLocalPa + drainLineComponentLossPa;
          results.losses.totalPressureLineLossMPa = parseFloat((totalPressureLineLosses / 1e6).toFixed(4));
          results.losses.totalDrainLineLossMPa = parseFloat((totalDrainLineLosses / 1e6).toFixed(4));
          console.log(`[${systemType.toUpperCase()}] Total Pressure Line Losses: ${results.losses.totalPressureLineLossMPa} MPa`);
          console.log(`[${systemType.toUpperCase()}] Total Drain Line Losses: ${results.losses.totalDrainLineLossMPa} MPa`);

          // --- Расчет требуемого давления насоса ---
          let requiredPumpPressurePa = pump.properties?.nominalPressureMPa ? pump.properties.nominalPressureMPa * 1e6 : 16e6;
          let actualCylinderPressurePa = 0;
          if (cylinder) {
              actualCylinderPressurePa = calculateCylinderPressure(cylinder, totalDrainLineLosses);
              requiredPumpPressurePa = actualCylinderPressurePa + totalPressureLineLosses;
              console.log(`[${systemType.toUpperCase()}] Cylinder required pressure: ${(actualCylinderPressurePa / 1e6).toFixed(3)} MPa`);
              console.log(`[${systemType.toUpperCase()}] Pump required pressure: ${(requiredPumpPressurePa / 1e6).toFixed(3)} MPa`);
          } else {
              requiredPumpPressurePa = totalPressureLineLosses + totalDrainLineLosses;
              console.log(`[${systemType.toUpperCase()}] No cylinder. Pump pressure to overcome line losses: ${(requiredPumpPressurePa / 1e6).toFixed(3)} MPa`);
          }
          results.requiredPumpPressureMPa = parseFloat((requiredPumpPressurePa / 1e6).toFixed(3));

          // --- Расчет КПД системы ---
          const modulesInSystem = modules.filter(m => m.system === systemType || m.system === 'common');
          const hydraulicEff = calculateHydraulicEfficiency(requiredPumpPressurePa, totalPressureLineLosses + totalDrainLineLosses);
          const mechanicalEff = calculateOverallMechanicalEfficiency(modulesInSystem);
          const volumetricEff = calculateOverallVolumetricEfficiency(modulesInSystem, pumpFlowM3s, drainFlowM3s, !!cylinder, pressurePathCompInstanceIds, drainPathCompInstanceIds);
          const systemEfficiency = hydraulicEff * mechanicalEff * volumetricEff;
          results.systemEfficiency = Math.max(0, Math.min(1, parseFloat(systemEfficiency.toFixed(4))));
          console.log(`[${systemType.toUpperCase()}] Calculated Efficiencies: Hydr=${hydraulicEff.toFixed(3)}, Mech=${mechanicalEff.toFixed(3)}, Vol=${volumetricEff.toFixed(3)}, Total=${results.systemEfficiency.toFixed(3)}`);

          // --- Расчет выделяемого тепла ---
          const pumpTotalEfficiency = pump.properties.volumetricEff * pump.properties.mechEff;
          const pumpPowerKw = pumpTotalEfficiency > 0 ? (requiredPumpPressurePa * pumpFlowM3s) / pumpTotalEfficiency / 1000 : 0;
          results.pumpPowerKw = parseFloat(pumpPowerKw.toFixed(3));
          const heatGeneratedKw = pumpPowerKw * (1 - results.systemEfficiency);
          results.heatGeneratedKw = parseFloat(heatGeneratedKw.toFixed(3));
          totalHeatGenerated += heatGeneratedKw;
          console.log(`${systemType.toUpperCase()}] Pump Power: ${pumpPowerKw.toFixed(3)} kW, Heat Generated: ${heatGeneratedKw.toFixed(3)} kW`);

          systemResults[systemType] = results;
          console.log(`--- Finished system: ${systemType.toUpperCase()} ---`);
      } // --- КОНЕЦ ЦИКЛА ПО СИСТЕМАМ ---

      // --- Суммирование площадей оборудования ПОСЛЕ цикла ---
      totalEquipmentSurface = 0;
      modules.forEach(m => {
          if (m.type !== 'tank_output' && m.type !== 'engine_input' && m.properties && typeof m.properties.sideSurfaceArea === 'number') {
              totalEquipmentSurface += m.properties.sideSurfaceArea;
          }
      });
      console.log(`Total Equipment Surface Area (Fоб): ${totalEquipmentSurface.toFixed(4)} m²`);

      // --- 5. Тепловой расчет ---
      console.log(`--- Calculating Thermal Balance ---`);
      console.log(`Total Heat Generated (Q1): ${totalHeatGenerated.toFixed(3)} kW`);

      if (!tankModule.properties) { return res.status(500).json({ error: "Internal server error: Tank properties missing." }); }
      const tankProps = tankModule.properties;
      const tankOuterSurface = 2 * (tankProps.length * tankProps.width + tankProps.length * tankProps.height + tankProps.width * tankProps.height);
      const tankHeatDissipationArea = 0.9 * tankOuterSurface;
      const totalHeatExchangeArea = totalEquipmentSurface + tankHeatDissipationArea;
      console.log(`Tank Outer Surface (Sпов): ${tankOuterSurface.toFixed(4)} m², Heat Dissipation Area (Fбпр): ${tankHeatDissipationArea.toFixed(4)} m²`);
      console.log(`Total Heat Exchange Area (F): ${totalHeatExchangeArea.toFixed(4)} m²`);

      let steadyStateTempC = environment.ambientTempC;
      if (environment.heatTransferCoeff > 0 && totalHeatExchangeArea > 0 && totalHeatGenerated > 0) {
           steadyStateTempC = (totalHeatGenerated * 1000) / (environment.heatTransferCoeff * totalHeatExchangeArea) + environment.ambientTempC;
      } else if (totalHeatGenerated <= 0) { console.log("No heat generated."); }
      else { console.warn("Cannot calculate steady state temperature."); steadyStateTempC = Infinity; }
      const finalTemp = steadyStateTempC === Infinity ? null : parseFloat(steadyStateTempC.toFixed(2));
      console.log(`Calculated Steady State Temperature (tж max): ${finalTemp === null ? 'Infinity' : finalTemp + ' °C'}`);

      // Расчет требуемой площади и заключение
      const targetSteadyStateTempC = 70;
      let requiredTotalHeatExchangeArea = 0;
      let requiredTankArea = 0;
      let conclusion = "Error determining tank sufficiency.";
      const deltaTemp = targetSteadyStateTempC - environment.ambientTempC;

      if (totalHeatGenerated <= 0) {
          conclusion = `No heat generated. Current tank area (${tankHeatDissipationArea.toFixed(2)}m²) is sufficient. Calculated steady temp: ${finalTemp === null ? 'N/A' : finalTemp.toFixed(1)+'°C'}.`;
          console.log("No heat generated, tank area sufficient by default.");
      } else if (deltaTemp > 0 && environment.heatTransferCoeff > 0 && totalHeatExchangeArea > 0) {
          requiredTotalHeatExchangeArea = (totalHeatGenerated * 1000) / (environment.heatTransferCoeff * deltaTemp);
          requiredTankArea = Math.max(0, requiredTotalHeatExchangeArea - totalEquipmentSurface);
          console.log(`Required Total Heat Exchange Area for ${targetSteadyStateTempC}°C: ${requiredTotalHeatExchangeArea.toFixed(4)} m²`);
          console.log(`Required Tank Area (Fб): ${requiredTankArea.toFixed(4)} m²`);
          if (tankHeatDissipationArea >= requiredTankArea) {
              conclusion = `Current tank area (${tankHeatDissipationArea.toFixed(2)}m²) IS sufficient for ${targetSteadyStateTempC}°C target. Calculated steady temp: ${finalTemp === null ? 'Infinity' : finalTemp.toFixed(1)+'°C'}.`;
              console.log("Current tank surface area is SUFFICIENT.");
          } else {
              conclusion = `Current tank area (${tankHeatDissipationArea.toFixed(2)}m²) IS INSUFFICIENT for ${targetSteadyStateTempC}°C target (requires ${requiredTankArea.toFixed(2)}m²). Calculated steady temp: ${finalTemp === null ? 'Infinity' : finalTemp.toFixed(1)+'°C'}. Radiator likely needed.`;
              console.error("Current tank surface area is INSUFFICIENT.");
          }
      } else {
           console.warn("Cannot calculate required area: Check target/ambient temp, heat transfer coeff, total area.");
           conclusion = `Cannot calculate required area. Calculated steady temp: ${finalTemp === null ? 'Infinity' : finalTemp.toFixed(1)+'°C'}.`;
      }

      // --- 7. Формирование ответа ---
      res.status(200).json({
          message: "Hydraulic calculation with cylinder pressure, pump pressure demand, and corrected component losses.",
          calculatedSteadyStateTempC: finalTemp,
          requiredTankArea: parseFloat(requiredTankArea.toFixed(4)),
          currentTankArea: parseFloat(tankHeatDissipationArea.toFixed(4)),
          conclusion: conclusion,
          details: systemResults
      });

    } catch (error) {
      console.error("Error in /api/calculate-hydraulics:", error);
      res.status(500).json({ error: error.message || "An unexpected server error occurred during calculation." });
    }
}); // Конец обработчика



  
// --- API для схем ---

// POST: Сохранить новую схему
app.post('/api/schemes', async (req, res) => {
    try {
        const { name, data } = req.body;
        if (!name || !data || !Array.isArray(data.modules) || !Array.isArray(data.connections)) {
            return res.status(400).json({ error: 'Invalid data format. Required: name, data: { modules: [], connections: [] }' });
        }
        const newScheme = new Scheme({ name, data });
        await newScheme.save();
        res.status(201).json(newScheme); 
    } catch (error) {
        console.error("Error saving scheme:", error);
        res.status(500).json({ error: 'Failed to save scheme', details: error.message });
    }
});

// GET: Получить список всех схем (только ID и имена)
app.get('/api/schemes', async (req, res) => {
    try {
        const schemes = await Scheme.find().select('_id name').sort('name');
        res.status(200).json(schemes);
    } catch (error) {
        console.error("Error fetching scheme list:", error);
        res.status(500).json({ error: 'Failed to fetch scheme list', details: error.message });
    }
});

// GET: Получить конкретную схему по ID
app.get('/api/schemes/:id', async (req, res) => {
    try {
        const scheme = await Scheme.findById(req.params.id);
        if (!scheme) {
            return res.status(404).json({ error: 'Scheme not found' });
        }
        res.status(200).json(scheme); 
    } catch (error) {
        console.error("Error fetching scheme:", error);
        if (error.kind === 'ObjectId') {
             return res.status(400).json({ error: 'Invalid Scheme ID format' });
        }
        res.status(500).json({ error: 'Failed to fetch scheme', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});