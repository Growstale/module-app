const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5001;

mongoose.connect('mongodb://localhost:27017/diagrams', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB успешно подключен'))
    .catch(err => console.error('Ошибка подключения к MongoDB:', err));

const SchemeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    data: {
        modules: { type: Array, required: true },
        connections: { type: Array, required: true },
    },
}, { timestamps: true });

const Scheme = mongoose.model('Scheme', SchemeSchema);

app.use(cors());
app.use(express.json());

function findNextModuleInstance(sourceInstanceId, connections, modules, specificSourcePort = null) {
    const sourceIdToSearch = specificSourcePort || String(sourceInstanceId);
    const connection = connections.find(conn => String(conn.sourceId) === String(sourceIdToSearch));
    if (!connection) {
        return null;
    }
    let targetModuleId = String(connection.targetId);
    if (targetModuleId.includes('_in')) {
        targetModuleId = targetModuleId.split('_in')[0];
    }
    return modules.find(m => String(m.instanceId) === targetModuleId);
}

function traceToConsumer(startNode, connections, modules, tankModuleInstanceId, entrySplitterPortId = null) {
    let currentNode = startNode;
    const visited = new Set();
    let pathForDebug = [startNode.name + `(${startNode.instanceId})`];

    while (currentNode) {
        const currentNodeIdStr = String(currentNode.instanceId);
        if (visited.has(currentNodeIdStr)) {
            const lastGoodNodeNameAndId = pathForDebug[pathForDebug.length - 2];
            if (lastGoodNodeNameAndId) {
                const lastGoodNodeId = lastGoodNodeNameAndId.match(/\(([^)]+)\)/)[1];
                return modules.find(m => String(m.instanceId) === lastGoodNodeId) || startNode;
            }
            return startNode;
        }
        visited.add(currentNodeIdStr);

        if (currentNode.type === 'cylinder' || currentNodeIdStr === String(tankModuleInstanceId)) {
            return currentNode;
        }

        let nextNode = null;
        let sourcePortForNextNodeSearch = currentNodeIdStr;

        if (currentNode.type === 'splitter' && entrySplitterPortId && String(currentNode.instanceId) === String(entrySplitterPortId.split('_out')[0])) {
            sourcePortForNextNodeSearch = entrySplitterPortId;
        } else if (currentNode.type === 'splitter') {
            return currentNode;
        }

        nextNode = findNextModuleInstance(sourcePortForNextNodeSearch, connections, modules);

        if (!nextNode) {
            return currentNode;
        }

        pathForDebug.push(nextNode.name + `(${nextNode.instanceId})`);
        currentNode = nextNode;
        entrySplitterPortId = null;
    }

    const lastNodeInPathNameAndId = pathForDebug[pathForDebug.length - 1];
    if (lastNodeInPathNameAndId) {
        const match = lastNodeInPathNameAndId.match(/\(([^)]+)\)/);
        if (match && match[1]) {
            const lastNodeId = match[1];
            return modules.find(m => String(m.instanceId) === lastNodeId) || startNode;
        }
    }
    return startNode;
}

function findPathModules(
    startModuleInstanceId,
    endModuleInstanceId,
    connections,
    modules,
    visited = new Set(),
    currentSplitterPortForThisPath = null
) {
    const currentIdStr = String(startModuleInstanceId);
    const endIdStr = String(endModuleInstanceId);

    if (currentIdStr === endIdStr) {
        return [];
    }
    visited.add(currentIdStr);

    let shortestPath = null;
    const currentModule = modules.find(m => String(m.instanceId) === currentIdStr);
    let outgoingConnections = [];

    if (currentModule && currentModule.type === 'splitter') {
        if (currentSplitterPortForThisPath && String(currentModule.instanceId) === String(currentSplitterPortForThisPath.split('_out')[0])) {
            const specificOutputConn = connections.find(conn => String(conn.sourceId) === String(currentSplitterPortForThisPath));
            if (specificOutputConn) {
                outgoingConnections = [specificOutputConn];
            } else {
                return null;
            }
        } else {
            outgoingConnections = connections.filter(conn => String(conn.sourceId).startsWith(currentIdStr + "_out"));
        }
    } else {
        outgoingConnections = connections.filter(conn => String(conn.sourceId) === currentIdStr);
    }

    for (const conn of outgoingConnections) {
        let nextModuleInstanceId = conn.targetId;
        let actualNextModuleIdForFind = String(nextModuleInstanceId);

        if (typeof nextModuleInstanceId === 'string' && nextModuleInstanceId.includes('_in')) {
            actualNextModuleIdForFind = nextModuleInstanceId.split('_in')[0];
        }

        if (visited.has(actualNextModuleIdForFind)) {
            continue;
        }

        const nextModule = modules.find(m => String(m.instanceId) === actualNextModuleIdForFind);
        if (!nextModule) {
            continue;
        }

        if (actualNextModuleIdForFind === endIdStr) {
            if (shortestPath === null) {
                shortestPath = [];
            }
            continue;
        }

        const pathFromNext = findPathModules(
            actualNextModuleIdForFind,
            endIdStr,
            connections,
            modules,
            new Set(visited),
            null
        );

        if (pathFromNext !== null) {
            const currentPath = [nextModule, ...pathFromNext];
            if (shortestPath === null || currentPath.length < shortestPath.length) {
                shortestPath = currentPath;
            }
        }
    }
    return shortestPath;
}

function calculateVelocity(flowM3s, pipeDiameterM) {
    if (!pipeDiameterM || pipeDiameterM <= 0) return 0;
    const area = Math.PI * Math.pow(pipeDiameterM / 2, 2);
    if (area === 0) return Infinity;
    return flowM3s / area;
}

function calculateReynoldsNumber(velocity, diameter, kinematicViscosityM2s) {
    if (!kinematicViscosityM2s || kinematicViscosityM2s <= 0 || !diameter || diameter <= 0 || velocity === Infinity) return 0;
    return (velocity * diameter) / kinematicViscosityM2s;
}

function getBcoefficient(reynoldsNumber) {
    if (reynoldsNumber <= 0) return 1.0;
    if (reynoldsNumber < 50) return 2.2 - (reynoldsNumber / 50) * 0.4;
    if (reynoldsNumber < 100) return 1.8 - ((reynoldsNumber - 50) / 50) * 0.2;
    if (reynoldsNumber < 200) return 1.6 - ((reynoldsNumber - 100) / 100) * 0.2;
    if (reynoldsNumber < 500) return 1.4 - ((reynoldsNumber - 200) / 300) * 0.25;
    if (reynoldsNumber < 1000) return 1.15 - ((reynoldsNumber - 500) / 500) * 0.1;
    if (reynoldsNumber < 2300) return 1.05 - ((reynoldsNumber - 1000) / 1300) * 0.05;
    return 1.0;
}

function calculateLambda(reynoldsNumber, diameterM, roughnessM) {
    if (reynoldsNumber <= 0 || diameterM <= 0) return 0.1;
    if (reynoldsNumber < 2300) {
        return 75 / reynoldsNumber;
    } else {
        const relativeRoughness = roughnessM / diameterM;
        if (reynoldsNumber < 100000 && (relativeRoughness * reynoldsNumber * Math.sqrt(0.11 * Math.pow(relativeRoughness + 68 / reynoldsNumber, 0.25))) < 65) {
            return 0.3164 / Math.pow(reynoldsNumber, 0.25);
        }
        const term = relativeRoughness + (68 / reynoldsNumber);
        return 0.11 * Math.pow(term, 0.25);
    }
}

function calculateFrictionLoss(lambda, lengthM, diameterM, densityKgm3, velocityMs) {
    if (!diameterM || diameterM <= 0 || velocityMs === Infinity) return Infinity;
    return lambda * (lengthM / diameterM) * (densityKgm3 * Math.pow(velocityMs, 2) / 2);
}

function calculateLocalLoss(totalZeta, densityKgm3, velocityMs, reynoldsNumber) {
    if (velocityMs === Infinity) return Infinity;
    let bCoefficient = 1.0;
    if (reynoldsNumber < 2300) {
        bCoefficient = getBcoefficient(reynoldsNumber);
    }
    return bCoefficient * totalZeta * (densityKgm3 * Math.pow(velocityMs, 2) / 2);
}

function calculateHydraulicEfficiency(pressureAtSourcePa, totalHydraulicLossPaOnPath) {
    if (!pressureAtSourcePa || pressureAtSourcePa <= 0) return 0;
    const usefulPressure = Math.max(0, pressureAtSourcePa - totalHydraulicLossPaOnPath);
    return usefulPressure / pressureAtSourcePa;
}

function calculateOverallMechanicalEfficiency(modulesInPathAndPump) {
    let overallMechEff = 1.0;
    modulesInPathAndPump.forEach(module => {
        const props = module.properties || {};
        if ((module.type === 'pump' || module.type === 'cylinder') && typeof props.mechEff === 'number') {
            overallMechEff *= props.mechEff;
        }
    });
    return Math.max(0.1, overallMechEff);
}

function calculateOverallVolumetricEfficiency(
    modulesRelevantToPath,
    primaryFlowIntoPathM3s,
    drainFlowFromCylinderM3s,
    isCylinderOnThisPath,
    pressurePathCompInstanceIds,
    drainPathCompInstanceIds
) {
    let overallVolEff = 1.0;
    const pumpModule = modulesRelevantToPath.find(m => m.type === 'pump');
    if (pumpModule && pumpModule.properties && typeof pumpModule.properties.volumetricEff === 'number') {
        overallVolEff *= pumpModule.properties.volumetricEff;
    }

    const cylinderModule = modulesRelevantToPath.find(m => m.type === 'cylinder');
    if (isCylinderOnThisPath && cylinderModule && cylinderModule.properties && typeof cylinderModule.properties.volEff === 'number') {
        overallVolEff *= cylinderModule.properties.volEff;
    }

    modulesRelevantToPath.forEach(module => {
        const props = module.properties || {};
        if (module.type !== 'pump' && module.type !== 'cylinder' && typeof props.internalLeakage === 'number') {
            const leakageLmin = props.internalLeakage;
            if (leakageLmin > 0) {
                const leakageM3s = leakageLmin / 60000;
                let flowThroughThisComponentM3s = 0;

                if (pressurePathCompInstanceIds.includes(String(module.instanceId))) {
                    flowThroughThisComponentM3s = primaryFlowIntoPathM3s;
                } else if (isCylinderOnThisPath && drainPathCompInstanceIds.includes(String(module.instanceId))) {
                    flowThroughThisComponentM3s = drainFlowFromCylinderM3s;
                } else if (!isCylinderOnThisPath && drainPathCompInstanceIds.includes(String(module.instanceId))) {
                    flowThroughThisComponentM3s = primaryFlowIntoPathM3s;
                } else {
                    return;
                }

                if (flowThroughThisComponentM3s > leakageM3s) {
                    overallVolEff *= (flowThroughThisComponentM3s - leakageM3s) / flowThroughThisComponentM3s;
                } else if (flowThroughThisComponentM3s > 0) {
                    overallVolEff = 0;
                }
            }
        }
    });
    return Math.max(0.01, Math.min(1.0, overallVolEff));
}

function calculateCylinderPressure(cylinderModule, drainLineTotalLossPa) {
    if (!cylinderModule || !cylinderModule.properties) return 0;
    const props = cylinderModule.properties;
    const forceN = props.force || 0;
    const pistonDiameterM = props.pistonDiameter || 0;
    const rodDiameterM = props.rodDiameter || 0;
    const mechEff = props.mechEff || 0.9;

    if (forceN <= 0) return drainLineTotalLossPa > 0 ? drainLineTotalLossPa * 1.01 : 0;
    if (pistonDiameterM <= 0 || mechEff <= 0) return Infinity;

    const pistonAreaM2 = Math.PI * Math.pow(pistonDiameterM / 2, 2);
    const rodAreaM2 = rodDiameterM > 0 ? Math.PI * Math.pow(rodDiameterM / 2, 2) : 0;
    const rodSideEffectiveAreaM2 = pistonAreaM2 - rodAreaM2;

    if (pistonAreaM2 <= 0) return Infinity;
    return ((forceN / mechEff) + (drainLineTotalLossPa * rodSideEffectiveAreaM2)) / pistonAreaM2;
}

const lineCalculations = (
    lineDescription,
    modulesOnPath,
    flowM3s,
    defaultOverallZetaForLine,
    fluidProperties,
    DEFAULT_PIPE_DIAMETER,
    DEFAULT_PIPE_LENGTH,
    DEFAULT_PIPE_ROUGHNESS
) => {
    console.log(`  [${lineDescription}] Расчет потерь. Поток: ${(flowM3s * 60000).toFixed(2)} л/мин.`);
    let totalFrictionLossPa = 0;
    let totalLocalLossPa = 0;
    let sumVelocities = 0;
    let pipeCount = 0;
    const pipeDetailsArray = [];

    const pipesOnThisPath = modulesOnPath.filter(m => m.type === 'pipe');
    if (pipesOnThisPath.length > 0) {
        pipesOnThisPath.forEach((pipe) => {
            const pipeProps = pipe.properties || {};
            const diameter = pipeProps.diameter || DEFAULT_PIPE_DIAMETER;
            const length = pipeProps.length || DEFAULT_PIPE_LENGTH;
            const roughness = pipeProps.roughness || DEFAULT_PIPE_ROUGHNESS;
            const localZetaPipe = pipeProps.localResistanceCoeff || 0;

            const velocity = calculateVelocity(flowM3s, diameter);
            sumVelocities += velocity;
            pipeCount++;

            const reynolds = calculateReynoldsNumber(velocity, diameter, fluidProperties.kinematicViscosityM2s);
            const lambda = calculateLambda(reynolds, diameter, roughness);
            const frictionLoss = calculateFrictionLoss(lambda, length, diameter, fluidProperties.density, velocity);
            const localLossInPipe = calculateLocalLoss(localZetaPipe, fluidProperties.density, velocity, reynolds);

            totalFrictionLossPa += frictionLoss;
            totalLocalLossPa += localLossInPipe;

            pipeDetailsArray.push({
                instanceId: pipe.instanceId,
                name: pipe.name || 'Трубопровод',
                diameterM: parseFloat(diameter.toFixed(4)),
                lengthM: parseFloat(length.toFixed(2)),
                velocityMs: parseFloat(velocity.toFixed(3)),
                reynolds: parseFloat(reynolds.toFixed(0)),
                lambda: parseFloat(lambda.toFixed(4)),
                frictionLossPa: parseFloat(frictionLoss.toFixed(0)),
                localLossInPipePa: parseFloat(localLossInPipe.toFixed(0)),
            });
        });
    }

    const averageVelocityOverall = pipeCount > 0 ? sumVelocities / pipeCount : calculateVelocity(flowM3s, DEFAULT_PIPE_DIAMETER);
    const averageReynoldsOverall = calculateReynoldsNumber(averageVelocityOverall, DEFAULT_PIPE_DIAMETER, fluidProperties.kinematicViscosityM2s);
    totalLocalLossPa += calculateLocalLoss(defaultOverallZetaForLine, fluidProperties.density, averageVelocityOverall, averageReynoldsOverall);

    return {
        totalFrictionLossPa: totalFrictionLossPa,
        totalLocalLossPa: totalLocalLossPa,
        averageVelocityOverallMs: averageVelocityOverall,
        pipeDetails: pipeDetailsArray,
    };
};

function discoverBranchesRecursive(
    currentNode,
    currentFlowM3s,
    pathFromLastSplitterOrPump,
    initialPressureComponentsForThisBranch,
    pumpSystemType,
    connections,
    modules,
    tankId,
    branchesArrayOutput,
    visitedOnThisTraceSet,
    originalPumpFlowM3s,
    currentBranchNamePrefix
) {
    const currentNodeIdStr = String(currentNode.instanceId);
    const currentTraceKey = `${currentNodeIdStr}_${pathFromLastSplitterOrPump.map(m => m.instanceId).join(',')}_${initialPressureComponentsForThisBranch.map(m => m.instanceId).join(',')}`;

    if (visitedOnThisTraceSet.has(currentTraceKey)) {
        console.warn(`  [discoverBranchesRecursive] Обнаружен цикл или повторный обход узла ${currentNode.name} на том же пути (${currentBranchNamePrefix}). Остановка.`);
        return;
    }
    visitedOnThisTraceSet.add(currentTraceKey);

    if (currentNode.type === 'splitter') {
        const splitter = currentNode;
        console.log(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Узел ${splitter.name} (ID: ${splitter.instanceId}) - разветвитель.`);
        const splitterOutputs = connections.filter(c => String(c.sourceId).startsWith(String(splitter.instanceId) + "_out"));

        if (splitterOutputs.length > 0) {
            const flowPerSplitterOutput = currentFlowM3s / splitterOutputs.length;
            splitterOutputs.forEach((splitConn, index) => {
                let nextNodeIdRaw = String(splitConn.targetId);
                let nextNodeId = nextNodeIdRaw.split('_')[0];
                const nextNodeAfterSplitter = modules.find(m => String(m.instanceId) === nextNodeId);

                if (nextNodeAfterSplitter) {
                    const newBranchNamePrefix = `${currentBranchNamePrefix}_split${index}_to_${nextNodeAfterSplitter.name.replace(/[()\s]/g, '')}`;
                    discoverBranchesRecursive(
                        nextNodeAfterSplitter,
                        flowPerSplitterOutput,
                        [],
                        [...initialPressureComponentsForThisBranch, ...pathFromLastSplitterOrPump, splitter],
                        pumpSystemType,
                        connections,
                        modules,
                        tankId,
                        branchesArrayOutput,
                        new Set(visitedOnThisTraceSet),
                        originalPumpFlowM3s,
                        newBranchNamePrefix
                    );
                }
            });
        } else {
            console.warn(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Разветвитель ${splitter.name} не имеет выходных соединений. Считаем тупиком.`);
            branchesArrayOutput.push({
                branchName: `${currentBranchNamePrefix}_тупик_у_${splitter.name.replace(/[()\s]/g, '')}`,
                entryNodeInstanceId: splitter.instanceId,
                actualEntryNodeForPathCalc: splitter,
                flowM3s: currentFlowM3s,
                initialComponentsOnPressurePath: [...initialPressureComponentsForThisBranch, ...pathFromLastSplitterOrPump],
                entrySplitterPortId: null,
            });
        }
    } else if (currentNode.type === 'cylinder' || currentNodeIdStr === String(tankId)) {
        console.log(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Узел ${currentNode.name} - конечный потребитель/бак. Создание ветки.`);
        const entryNodeForThisDefinedBranch = pathFromLastSplitterOrPump.length > 0 ? pathFromLastSplitterOrPump[0] : currentNode;

        let originatingSplitterPort = null;
        if (initialPressureComponentsForThisBranch.length > 0) {
            const lastComponentInInitial = initialPressureComponentsForThisBranch[initialPressureComponentsForThisBranch.length - 1];
            if (lastComponentInInitial.type === 'splitter') {
                const connToEntry = connections.find(c => {
                    let targetId = String(c.targetId).split('_')[0];
                    return String(c.sourceId).startsWith(String(lastComponentInInitial.instanceId) + "_out") &&
                        targetId === String(entryNodeForThisDefinedBranch.instanceId);
                });
                if (connToEntry) {
                    originatingSplitterPort = connToEntry.sourceId;
                } else if (lastComponentInInitial.lastUsedPortId) {
                    originatingSplitterPort = lastComponentInInitial.lastUsedPortId;
                }
            }
        }

        branchesArrayOutput.push({
            branchName: currentBranchNamePrefix,
            entryNodeInstanceId: entryNodeForThisDefinedBranch.instanceId,
            actualEntryNodeForPathCalc: currentNode,
            flowM3s: currentFlowM3s,
            initialComponentsOnPressurePath: initialPressureComponentsForThisBranch,
            entrySplitterPortId: originatingSplitterPort,
        });
    } else {
        const nextConnections = connections.filter(c => String(c.sourceId) === currentNodeIdStr);
        if (nextConnections.length === 1) {
            let nextNodeIdRaw = String(nextConnections[0].targetId);
            let nextNodeId = nextNodeIdRaw.split('_')[0];
            const nextNode = modules.find(m => String(m.instanceId) === nextNodeId);
            if (nextNode) {
                discoverBranchesRecursive(
                    nextNode,
                    currentFlowM3s,
                    [...pathFromLastSplitterOrPump, currentNode],
                    initialPressureComponentsForThisBranch,
                    pumpSystemType,
                    connections,
                    modules,
                    tankId,
                    branchesArrayOutput,
                    new Set(visitedOnThisTraceSet),
                    originalPumpFlowM3s,
                    currentBranchNamePrefix
                );
            } else {
                console.warn(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Обрыв после ${currentNode.name}.`);
                branchesArrayOutput.push({ branchName: `${currentBranchNamePrefix}_обрыв_у_${currentNode.name.replace(/[()\s]/g, '')}`, entryNodeInstanceId: currentNode.instanceId, actualEntryNodeForPathCalc: currentNode, flowM3s: currentFlowM3s, initialComponentsOnPressurePath: [...initialPressureComponentsForThisBranch, ...pathFromLastSplitterOrPump] });
            }
        } else if (nextConnections.length > 1) {
            console.error(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Ошибка! Узел ${currentNode.name} (тип: ${currentNode.type}) не разветвитель, но имеет ${nextConnections.length} выходов.`);
        } else {
            console.warn(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Тупик после ${currentNode.name}.`);
            branchesArrayOutput.push({ branchName: `${currentBranchNamePrefix}_тупик_у_${currentNode.name.replace(/[()\s]/g, '')}`, entryNodeInstanceId: currentNode.instanceId, actualEntryNodeForPathCalc: currentNode, flowM3s: currentFlowM3s, initialComponentsOnPressurePath: [...initialPressureComponentsForThisBranch, ...pathFromLastSplitterOrPump] });
        }
    }
}

app.post('/api/calculate-hydraulics', async (req, res) => {
    console.log("Получен запрос /api/calculate-hydraulics");
    try {
        const { modules, connections } = req.body;
        if (!Array.isArray(modules) || modules.length === 0) {
            return res.status(400).json({ error: "Неверный ввод: 'modules' должен быть непустым массивом." });
        }

        const engine = modules.find(m => m.type === 'engine_input');
        const tankModule = modules.find(m => m.type === 'tank_output');
        const allPumps = modules.filter(m => m.type === 'pump');

        if (!engine) return res.status(400).json({ error: "Модуль двигателя не найден." });
        if (!tankModule) return res.status(400).json({ error: "Модуль гидробака не найден на схеме." });
        if (allPumps.length === 0) return res.status(400).json({ error: "Модули насосов не найдены." });

        const fluid = { density: 868, kinematicViscosityM2s: 33.2e-6 };
        const environment = { ambientTempC: 30, heatTransferCoeff: 15 };
        const DEFAULT_PIPE_DIAMETER = 0.010;
        const DEFAULT_PIPE_LENGTH = 0.5;
        const DEFAULT_PIPE_ROUGHNESS = 0.00005;

        let currentEngineRpm;
        const engineProps = engine.properties || {};
        switch (engineProps.selectedRpmMode) {
            case 'idleRpm': currentEngineRpm = engineProps.idleRpm; break;
            case 'maxTorqueRpm': currentEngineRpm = engineProps.maxTorqueRpm; break;
            default: currentEngineRpm = engineProps.nominalRpm; break;
        }
        if (!currentEngineRpm || currentEngineRpm <= 0) {
            return res.status(400).json({ error: "Неверные или отсутствующие обороты двигателя." });
        }
        console.log(`Расчет для оборотов двигателя: ${currentEngineRpm} об/мин`);

        const systemResultsAccumulator = {};
        let totalHeatGeneratedOverallKw = 0;
        let totalEquipmentSurfaceOverallM2 = 0;
        modules.forEach(m => {
            if (m.type !== 'tank_output' && m.type !== 'engine_input' && m.properties && typeof m.properties.sideSurfaceArea === 'number') {
                totalEquipmentSurfaceOverallM2 += m.properties.sideSurfaceArea;
            }
        });
        console.log(`Общая площадь теплообмена оборудования (Fоб_общая): ${totalEquipmentSurfaceOverallM2.toFixed(4)} м²`);

        for (const pump of allPumps) {
            const pumpProps = pump.properties || {};
            const pumpSystemType = pump.system || 'unknown_system';
            const pumpInstanceIdStr = String(pump.instanceId);
            console.log(`\n--- ОБРАБОТКА НАСОСА: ${pump.name} (Система: ${pumpSystemType.toUpperCase()}) ---`);

            const systemSpecificResults = {
                pumpFlowLmin: 0, pumpFlowM3s: 0, actualOutletPressureMPa: 0, powerInputKw: 0,
                overallSystemEfficiency: 0, systemHydraulicEfficiencyGlobal: 0, systemVolumetricEfficiencyGlobal: 0,
                branches: {}, commonDrainPipesByCollector: {}, suctionLinePipeDetails: [], commonPathPipeDetails: [],
            };

            const pumpRpm = currentEngineRpm * (pumpProps.driveRatio || 1);
            const pumpVolEff = pumpProps.volumetricEff || 0.9;
            const pumpWorkingVolumeM3 = (pumpProps.workingVolume || 0) * 1e-6;

            if (pumpWorkingVolumeM3 <= 0) {
                console.warn(`[${pumpSystemType.toUpperCase()}] Насос ${pump.name} имеет неверный рабочий объем. Пропуск.`);
                systemResultsAccumulator[pump.name + "_" + pumpSystemType] = { ...systemSpecificResults, error: "Неверный рабочий объем насоса." };
                continue;
            }

            const pumpNominalFlowM3s = (pumpWorkingVolumeM3 * (pumpRpm / 60)) * pumpVolEff;
            const pumpNominalFlowLmin = pumpNominalFlowM3s * 60000;
            systemSpecificResults.pumpFlowLmin = parseFloat(pumpNominalFlowLmin.toFixed(2));
            systemSpecificResults.pumpFlowM3s = pumpNominalFlowM3s;
            console.log(`[${pumpSystemType.toUpperCase()}] Подача насоса ${pump.name}: ${systemSpecificResults.pumpFlowLmin} л/мин (${pumpNominalFlowM3s.toExponential(3)} м³/с) при ${pumpRpm.toFixed(0)} об/мин`);

            let branchesToProcess = [];
            const directPumpOutputsConnections = connections.filter(c => String(c.sourceId) === pumpInstanceIdStr);
            let commonPathFromPump = [];
            let firstActiveNodeOrSplitterAfterCommonPath = null;
            let commonPathLossesPa = 0;

            const suctionConnection = connections.find(c => String(c.targetId) === pumpInstanceIdStr);
            if (suctionConnection) {
                const suctionSourceModule = modules.find(m => String(m.instanceId) === String(suctionConnection.sourceId));
                let suctionLineComponentsToCalculate = [];

                if (suctionSourceModule && suctionSourceModule.type === 'pipe') {
                    suctionLineComponentsToCalculate.push(suctionSourceModule);
                } else if (suctionSourceModule && suctionSourceModule.type === 'tank_output') {
                } else if (suctionSourceModule) {
                    console.warn(`[${pumpSystemType.toUpperCase()}] Всасывающая линия насоса ${pump.name} подключена к модулю типа ${suctionSourceModule.type}, а не к трубе или баку. Расчет потерь на всасе может быть неполным.`);
                    const pathFromTankToPump = findPathModules(String(tankModule.instanceId), pumpInstanceIdStr, connections, modules, new Set(), null);
                    if (pathFromTankToPump) {
                        suctionLineComponentsToCalculate = pathFromTankToPump.filter(m => m.type === 'pipe');
                    }
                }

                if (suctionLineComponentsToCalculate.length > 0) {
                    const suctionLossInfo = lineCalculations(
                        `${pumpSystemType}_ВсасывающаяЛиния`,
                        suctionLineComponentsToCalculate,
                        pumpNominalFlowM3s,
                        0.5,
                        fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
                    );
                    systemSpecificResults.suctionLinePipeDetails = suctionLossInfo.pipeDetails;
                    const totalSuctionLossPa = suctionLossInfo.totalFrictionLossPa + suctionLossInfo.totalLocalLossPa;
                    console.log(`  [${pumpSystemType.toUpperCase()}] Потери на всасывающей линии: ~${(totalSuctionLossPa / 1e6).toFixed(4)} МПа (не учитываются в давлении нагнетания)`);
                } else {
                    systemSpecificResults.suctionLinePipeDetails = [];
                }
            } else {
                systemSpecificResults.suctionLinePipeDetails = [];
                console.warn(`[${pumpSystemType.toUpperCase()}] Для насоса ${pump.name} не найдено всасывающего соединения.`);
            }

            if (directPumpOutputsConnections.length === 1) {
                let currentNodeId = String(directPumpOutputsConnections[0].targetId).split('_')[0];
                let currentNode = modules.find(m => String(m.instanceId) === currentNodeId);
                let tempPath = [];
                let visitedTracer = new Set();

                while (currentNode && !visitedTracer.has(String(currentNode.instanceId))) {
                    visitedTracer.add(String(currentNode.instanceId));
                    if (['splitter', 'cylinder', 'tank_output', 'collector', 'distributor', 'block', 'filter'].includes(currentNode.type)) {
                        firstActiveNodeOrSplitterAfterCommonPath = currentNode;
                        break;
                    }
                    tempPath.push(currentNode);
                    const nextModule = findNextModuleInstance(currentNode.instanceId, connections, modules);
                    if (!nextModule) {
                        firstActiveNodeOrSplitterAfterCommonPath = currentNode;
                        break;
                    }
                    currentNode = nextModule;
                }
                if (!firstActiveNodeOrSplitterAfterCommonPath && tempPath.length > 0) {
                    firstActiveNodeOrSplitterAfterCommonPath = tempPath[tempPath.length - 1];
                } else if (!firstActiveNodeOrSplitterAfterCommonPath && tempPath.length === 0 && directPumpOutputsConnections.length > 0) {
                    firstActiveNodeOrSplitterAfterCommonPath = modules.find(m => String(m.instanceId) === String(directPumpOutputsConnections[0].targetId).split('_')[0]);
                }
                commonPathFromPump = tempPath;
            } else if (directPumpOutputsConnections.length > 1) {
                firstActiveNodeOrSplitterAfterCommonPath = pump;
            }

            console.log(`[${pumpSystemType.toUpperCase()}] Общий путь от насоса: ${commonPathFromPump.map(m => m.name).join(' -> ')}. Первый активный/разветвитель: ${firstActiveNodeOrSplitterAfterCommonPath?.name}`);

            if (commonPathFromPump.length > 0) {
                const commonLossesInfo = lineCalculations(
                    `${pumpSystemType}_ОбщийУчасток`, commonPathFromPump, pumpNominalFlowM3s, 0,
                    fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
                );
                commonPathLossesPa = commonLossesInfo.totalFrictionLossPa + commonLossesInfo.totalLocalLossPa;
                systemSpecificResults.commonPathPipeDetails = commonLossesInfo.pipeDetails;

                commonPathFromPump.filter(m => m.type !== 'pipe').forEach(comp => {
                    const compProps = comp.properties || {};
                    const nomLossMPa = compProps.pressureDrop || 0;
                    const nomFlowLmin = compProps.nominalFlowLmin || 0;
                    if (nomLossMPa > 0 && nomFlowLmin > 0) {
                        const nomFlowM3s = nomFlowLmin / 60000;
                        if (nomFlowM3s > 0) commonPathLossesPa += nomLossMPa * 1e6 * Math.pow(pumpNominalFlowM3s / nomFlowM3s, 2);
                        else commonPathLossesPa += nomLossMPa * 1e6;
                    } else if (nomLossMPa > 0) {
                        commonPathLossesPa += nomLossMPa * 1e6;
                    }
                });
            } else {
                systemSpecificResults.commonPathPipeDetails = [];
            }
            console.log(`[${pumpSystemType.toUpperCase()}] Потери на общем участке до '${firstActiveNodeOrSplitterAfterCommonPath?.name || 'конца'}': ${(commonPathLossesPa / 1e6).toFixed(4)} МПа`);

            if (firstActiveNodeOrSplitterAfterCommonPath) {
                if (firstActiveNodeOrSplitterAfterCommonPath.instanceId === pump.instanceId && directPumpOutputsConnections.length > 1) {
                    console.log(`[${pumpSystemType.toUpperCase()}] Насос ${pump.name} имеет ${directPumpOutputsConnections.length} прямых выходов. Обработка каждого как ветви.`);
                    const flowPerDirectOutput = pumpNominalFlowM3s / directPumpOutputsConnections.length;
                    directPumpOutputsConnections.forEach((conn, index) => {
                        let nextNodeId = String(conn.targetId).split('_')[0];
                        const nextNodeAfterPump = modules.find(m => String(m.instanceId) === nextNodeId);
                        if (nextNodeAfterPump) {
                            discoverBranchesRecursive(
                                nextNodeAfterPump, flowPerDirectOutput, [], [], pumpSystemType, connections, modules,
                                String(tankModule.instanceId), branchesToProcess, new Set(), pumpNominalFlowM3s,
                                `${pumpSystemType}_directOut${index}_to_${nextNodeAfterPump.name.replace(/[()\s]/g, '')}`
                            );
                        }
                    });
                } else {
                    discoverBranchesRecursive(
                        firstActiveNodeOrSplitterAfterCommonPath, pumpNominalFlowM3s, [], commonPathFromPump, pumpSystemType,
                        connections, modules, String(tankModule.instanceId), branchesToProcess, new Set(), pumpNominalFlowM3s,
                        `${pumpSystemType}_отАктивного_${firstActiveNodeOrSplitterAfterCommonPath.name.replace(/[()\s]/g, '')}`
                    );
                }
            } else if (directPumpOutputsConnections.length === 1) {
                const fallbackNode = modules.find(m => String(m.instanceId) === String(directPumpOutputsConnections[0].targetId).split('_')[0]);
                if (fallbackNode) {
                    console.log(`[${pumpSystemType.toUpperCase()}] Общий путь не привел к активному узлу, но есть прямой выход к ${fallbackNode.name}. Попытка анализа.`);
                    discoverBranchesRecursive(
                        fallbackNode, pumpNominalFlowM3s, [], [], pumpSystemType, connections, modules,
                        String(tankModule.instanceId), branchesToProcess, new Set(), pumpNominalFlowM3s,
                        `${pumpSystemType}_прямой_к_${fallbackNode.name.replace(/[()\s]/g, '')}`
                    );
                }
            }

            const uniqueBranches = [];
            const uniqueKeys = new Set();
            for (const branch of branchesToProcess) {
                const endConsumerForBranch = modules.find(m => String(m.instanceId) === String(branch.actualEntryNodeForPathCalc.instanceId));
                const key = `${branch.entryNodeInstanceId}_to_${endConsumerForBranch?.instanceId}_via_${branch.initialComponentsOnPressurePath.map(c => c.instanceId).join(',')}_port_${branch.entrySplitterPortId || 'none'}`;
                if (!uniqueKeys.has(key)) {
                    uniqueKeys.add(key);
                    uniqueBranches.push(branch);
                }
            }
            branchesToProcess = uniqueBranches;

            if (branchesToProcess.length === 0) {
                console.warn(`[${pumpSystemType.toUpperCase()}] Для насоса ${pump.name} не найдено УНИКАЛЬНЫХ активных веток.`);
                systemResultsAccumulator[pump.name + "_" + pumpSystemType] = { ...systemSpecificResults, error: "Нет уникальных активных веток." };
                continue;
            }
            console.log(`[${pumpSystemType.toUpperCase()}] Найдено ${branchesToProcess.length} УНИКАЛЬНЫХ веток для насоса ${pump.name}: ${branchesToProcess.map(b => b.branchName).join(', ')}`);

            let maxRequiredPressureAtPumpOutletPa = 0;
            const processedBranchResults = [];
            let sumOfUsefulWorkFromCylindersKwThisPump = 0;
            let sumOfActualFlowThroughCylindersM3sThisPump = 0;
            let sumOfHydraulicUsefulPowerAtCylindersPaM3s = 0;

            for (const branch of branchesToProcess) {
                const entryNodeForBranch = modules.find(m => String(m.instanceId) === String(branch.entryNodeInstanceId));
                const endConsumerNodeForThisBranch = modules.find(m => String(m.instanceId) === String(branch.actualEntryNodeForPathCalc.instanceId));

                if (!entryNodeForBranch || !endConsumerNodeForThisBranch) {
                    console.warn(`[${pumpSystemType.toUpperCase()}] Пропуск ветки ${branch.branchName}: не найден входной или конечный узел.`);
                    continue;
                }
                console.log(`  -- Обработка ветки: ${branch.branchName} (Вход: ${entryNodeForBranch.name}, Конец: ${endConsumerNodeForThisBranch.name}, Поток: ${(branch.flowM3s * 60000).toFixed(2)} л/мин) --`);

                const branchResult = {
                    velocities: {}, losses: { friction: {}, local: {}, components: {} }, efficiency: {},
                    requiredBranchPressureMPa: 0, heatGeneratedKw: 0, cylinderCalculatedParams: null,
                    pressureLinePipeDetails: [], drainLinePipeDetails: [],
                };

                const branchCylinder = endConsumerNodeForThisBranch.type === 'cylinder' ? endConsumerNodeForThisBranch : null;
                const isBypassToTank = String(endConsumerNodeForThisBranch.instanceId) === String(tankModule.instanceId) && !branchCylinder;

                let pressurePathInsideBranchOnly = [];
                if (String(entryNodeForBranch.instanceId) !== String(endConsumerNodeForThisBranch.instanceId)) {
                    pressurePathInsideBranchOnly = findPathModules(
                        String(entryNodeForBranch.instanceId),
                        String(endConsumerNodeForThisBranch.instanceId),
                        connections, modules,
                        new Set([String(entryNodeForBranch.instanceId)]),
                        branch.entrySplitterPortId
                    ) || [];
                }

                let pathForBranchPressureLosses = [...branch.initialComponentsOnPressurePath];
                if (String(entryNodeForBranch.instanceId) !== String(endConsumerNodeForThisBranch.instanceId) &&
                    !branch.initialComponentsOnPressurePath.find(m => String(m.instanceId) === String(entryNodeForBranch.instanceId))) {
                    pathForBranchPressureLosses.push(entryNodeForBranch);
                }
                pathForBranchPressureLosses.push(...pressurePathInsideBranchOnly);
                pathForBranchPressureLosses = pathForBranchPressureLosses.reduce((acc, m) => {
                    if (m && !acc.find(x => String(x.instanceId) === String(m.instanceId))) acc.push(m);
                    return acc;
                }, []);


                const pressureLineCalculationResult = lineCalculations(
                    `${branch.branchName}_НапорнаяВетки`, pathForBranchPressureLosses, branch.flowM3s, 1.5,
                    fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
                );
                branchResult.pressureLinePipeDetails = pressureLineCalculationResult.pipeDetails;
                branchResult.losses.friction.pressurePa = parseFloat(pressureLineCalculationResult.totalFrictionLossPa.toFixed(0));
                branchResult.losses.local.pressurePa = parseFloat(pressureLineCalculationResult.totalLocalLossPa.toFixed(0));

                let componentLossPressureInBranchPa = 0;
                const pressurePathInBranchCompInstanceIds = pathForBranchPressureLosses.map(m => String(m.instanceId));
                pathForBranchPressureLosses.filter(m => m.type !== 'pipe').forEach(comp => {
                    if (commonPathFromPump.find(cp => String(cp.instanceId) === String(comp.instanceId))) return;

                    const compProps = comp.properties || {};
                    const nomLossMPa = compProps.pressureDrop || 0;
                    const nomFlowLmin = compProps.nominalFlowLmin || 0;
                    let compFlowM3s = branch.flowM3s;

                    if (comp.type === 'splitter' && branch.initialComponentsOnPressurePath.find(c => String(c.instanceId) === String(comp.instanceId))) {
                        compFlowM3s = pumpNominalFlowM3s;
                    }

                    if (nomLossMPa > 0 && nomFlowLmin > 0) {
                        const nomFlowM3s = nomFlowLmin / 60000;
                        if (nomFlowM3s > 0) componentLossPressureInBranchPa += nomLossMPa * 1e6 * Math.pow(compFlowM3s / nomFlowM3s, 2);
                        else componentLossPressureInBranchPa += nomLossMPa * 1e6;
                    } else if (nomLossMPa > 0) {
                        componentLossPressureInBranchPa += nomLossMPa * 1e6;
                    }
                });
                branchResult.losses.components.pressurePa = parseFloat(componentLossPressureInBranchPa.toFixed(0));
                const totalPressureLossInsideBranchPa = pressureLineCalculationResult.totalFrictionLossPa + pressureLineCalculationResult.totalLocalLossPa + componentLossPressureInBranchPa;


                let drainFlowForBranchM3s = branch.flowM3s;
                let drainLineCalculationResult = { totalFrictionLossPa: 0, totalLocalLossPa: 0, pipeDetails: [] };
                let componentLossDrainPa = 0;
                let fullDrainPathForBranch = [];
                let drainPathInBranchCompInstanceIds = [];

                if (branchCylinder) {
                    const cylProps = branchCylinder.properties || {};
                    const D_piston = cylProps.pistonDiameter;
                    const d_rod = cylProps.rodDiameter;
                    if (D_piston && D_piston > 0) {
                        const pistonArea = Math.PI * Math.pow(D_piston / 2, 2);
                        const rodArea = (d_rod && d_rod > 0) ? Math.PI * Math.pow(d_rod / 2, 2) : 0;
                        if (pistonArea > rodArea) {
                            drainFlowForBranchM3s = branch.flowM3s * (pistonArea - rodArea) / pistonArea;
                        }
                    }

                    fullDrainPathForBranch = findPathModules(String(branchCylinder.instanceId), String(tankModule.instanceId), connections, modules, new Set([String(branchCylinder.instanceId)])) || [];
                    drainPathInBranchCompInstanceIds = fullDrainPathForBranch.map(m => String(m.instanceId));

                    drainLineCalculationResult = lineCalculations(
                        `${branch.branchName}_Сливная`, fullDrainPathForBranch, drainFlowForBranchM3s, 1.0,
                        fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
                    );
                    branchResult.drainLinePipeDetails = drainLineCalculationResult.pipeDetails;
                    fullDrainPathForBranch.filter(m => m.type !== 'pipe').forEach(comp => {
                        const compProps = comp.properties || {};
                        const nomLossMPa = compProps.pressureDrop || 0;
                        const nomFlowLmin = compProps.nominalFlowLmin || 0;
                        if (nomLossMPa > 0 && nomFlowLmin > 0) {
                            const nomFlowM3s = nomFlowLmin / 60000;
                            if (nomFlowM3s > 0) componentLossDrainPa += nomLossMPa * 1e6 * Math.pow(drainFlowForBranchM3s / nomFlowM3s, 2);
                            else componentLossDrainPa += nomLossMPa * 1e6;
                        } else if (nomLossMPa > 0) {
                            componentLossDrainPa += nomLossMPa * 1e6;
                        }
                    });
                }
                branchResult.losses.friction.drainPa = parseFloat(drainLineCalculationResult.totalFrictionLossPa.toFixed(0));
                branchResult.losses.local.drainPa = parseFloat(drainLineCalculationResult.totalLocalLossPa.toFixed(0));
                branchResult.losses.components.drainPa = parseFloat(componentLossDrainPa.toFixed(0));
                const totalDrainLineLossPa = drainLineCalculationResult.totalFrictionLossPa + drainLineCalculationResult.totalLocalLossPa + componentLossDrainPa;

                branchResult.losses.totalPressureLineLossMPa = parseFloat((totalPressureLossInsideBranchPa / 1e6).toFixed(4));
                branchResult.losses.totalDrainLineLossMPa = parseFloat((totalDrainLineLossPa / 1e6).toFixed(4));

                let requiredPressureAtBranchEntryPa = 0;
                let cylinderWorkingPressurePa = 0;
                if (branchCylinder) {
                    cylinderWorkingPressurePa = calculateCylinderPressure(branchCylinder, totalDrainLineLossPa);
                    requiredPressureAtBranchEntryPa = cylinderWorkingPressurePa + totalPressureLossInsideBranchPa;
                } else if (isBypassToTank) {
                    requiredPressureAtBranchEntryPa = totalPressureLossInsideBranchPa;
                }
                branchResult.requiredBranchPressureMPa = parseFloat((requiredPressureAtBranchEntryPa / 1e6).toFixed(3));

                let pressureAtPumpOutletForThisBranchTotal = requiredPressureAtBranchEntryPa + commonPathLossesPa;
                maxRequiredPressureAtPumpOutletPa = Math.max(maxRequiredPressureAtPumpOutletPa, pressureAtPumpOutletForThisBranchTotal);

                if (branchCylinder) {
                    const cylProps = branchCylinder.properties || {};
                    const pistonDiameter = cylProps.pistonDiameter || 0;
                    const forceN = cylProps.force || 0;
                    let rodSpeedMs = 0;
                    let actualFlowToCylinderM3s = 0;
                    let usefulPowerKw = 0;

                    const modulesOnPressurePathToCylinder = [...pathForBranchPressureLosses.filter(m => String(m.instanceId) !== String(branchCylinder.instanceId))];
                    const volEffPressureSide = calculateOverallVolumetricEfficiency(
                        modulesOnPressurePathToCylinder, branch.flowM3s, 0, false,
                        modulesOnPressurePathToCylinder.map(m => String(m.instanceId)), []
                    );
                    actualFlowToCylinderM3s = branch.flowM3s * volEffPressureSide * (cylProps.volEff || 1.0);

                    if (pistonDiameter > 0) {
                        const pistonAreaM2 = Math.PI * Math.pow(pistonDiameter / 2, 2);
                        rodSpeedMs = actualFlowToCylinderM3s / pistonAreaM2;
                        usefulPowerKw = (forceN * rodSpeedMs) / 1000;
                        sumOfUsefulWorkFromCylindersKwThisPump += usefulPowerKw;
                        sumOfActualFlowThroughCylindersM3sThisPump += actualFlowToCylinderM3s;
                    }
                    branchResult.cylinderCalculatedParams = {
                        cylinderInstanceId: branchCylinder.instanceId,
                        pistonChamberPressureMPa: parseFloat((cylinderWorkingPressurePa / 1e6).toFixed(3)),
                        rodChamberPressureMPa: parseFloat((totalDrainLineLossPa / 1e6).toFixed(3)),
                        rodSpeedMs: parseFloat(rodSpeedMs.toFixed(4)),
                        usefulPowerKw: parseFloat(usefulPowerKw.toFixed(3)),
                        actualFlowToCylinderM3s: parseFloat(actualFlowToCylinderM3s.toExponential(3)),
                    };
                    sumOfHydraulicUsefulPowerAtCylindersPaM3s += (cylinderWorkingPressurePa - totalDrainLineLossPa) * actualFlowToCylinderM3s;
                }

                const modulesForCleanBranchEffCalc = [...pathForBranchPressureLosses, ...(branchCylinder ? [branchCylinder, ...fullDrainPathForBranch] : [])]
                    .filter(Boolean)
                    .reduce((acc, m) => {
                        if (m && !acc.find(x => String(x.instanceId) === String(m.instanceId))) acc.push(m);
                        return acc;
                    }, []);

                const totalLossesForCleanBranchHydEff = totalPressureLossInsideBranchPa + (branchCylinder || isBypassToTank ? totalDrainLineLossPa : 0);
                const cleanBranchHydEff = calculateHydraulicEfficiency(requiredPressureAtBranchEntryPa, totalLossesForCleanBranchHydEff);
                const cleanBranchMechEff = calculateOverallMechanicalEfficiency(modulesForCleanBranchEffCalc);
                const cleanBranchVolEff = calculateOverallVolumetricEfficiency(
                    modulesForCleanBranchEffCalc, branch.flowM3s, drainFlowForBranchM3s, !!branchCylinder,
                    pressurePathInBranchCompInstanceIds, drainPathInBranchCompInstanceIds
                );
                branchResult.efficiency = {
                    hydraulic: parseFloat(cleanBranchHydEff.toFixed(3)),
                    mechanical: parseFloat(cleanBranchMechEff.toFixed(3)),
                    volumetric: parseFloat(cleanBranchVolEff.toFixed(3)),
                    total: parseFloat(Math.max(0, (cleanBranchHydEff * cleanBranchMechEff * cleanBranchVolEff)).toFixed(4)),
                };
                processedBranchResults.push({ branchName: branch.branchName, ...branchResult });
            }

            systemSpecificResults.actualOutletPressureMPa = parseFloat((maxRequiredPressureAtPumpOutletPa / 1e6).toFixed(3));
            const pumpMechEff = pumpProps.mechEff || 0.85;
            const pumpShaftPowerKw = Math.max(0, (maxRequiredPressureAtPumpOutletPa * pumpNominalFlowM3s) / pumpMechEff / 1000);
            systemSpecificResults.powerInputKw = parseFloat(pumpShaftPowerKw.toFixed(3));

            if (pumpShaftPowerKw > 0.00001) {
                systemSpecificResults.overallSystemEfficiency = parseFloat(Math.max(0, Math.min(1, (sumOfUsefulWorkFromCylindersKwThisPump / pumpShaftPowerKw))).toFixed(4));
            } else {
                systemSpecificResults.overallSystemEfficiency = 0;
            }

            const pumpHydraulicOutputPowerKwAtActualPressure = (maxRequiredPressureAtPumpOutletPa * pumpNominalFlowM3s) / 1000;
            const usefulHydraulicPowerAtCylindersKw = sumOfHydraulicUsefulPowerAtCylindersPaM3s / 1000;
            if (pumpHydraulicOutputPowerKwAtActualPressure > 0.00001) {
                systemSpecificResults.systemHydraulicEfficiencyGlobal = parseFloat(Math.max(0, Math.min(1, (usefulHydraulicPowerAtCylindersKw / pumpHydraulicOutputPowerKwAtActualPressure))).toFixed(3));
            } else {
                systemSpecificResults.systemHydraulicEfficiencyGlobal = 0;
            }

            if (systemSpecificResults.pumpFlowM3s > 0.00001) {
                systemSpecificResults.systemVolumetricEfficiencyGlobal = parseFloat(Math.max(0, Math.min(1, (sumOfActualFlowThroughCylindersM3sThisPump / systemSpecificResults.pumpFlowM3s)))).toFixed(3);
            } else {
                systemSpecificResults.systemVolumetricEfficiencyGlobal = 0;
            }

            console.log(`  [${pumpSystemType.toUpperCase()}] Общий КПД системы насоса ${pump.name}: ${systemSpecificResults.overallSystemEfficiency}, Гидравлический (глоб.): ${systemSpecificResults.systemHydraulicEfficiencyGlobal}, Объемный (глоб. после насоса): ${systemSpecificResults.systemVolumetricEfficiencyGlobal}`);
            const heatFromThisPumpSystemKw = pumpShaftPowerKw - sumOfUsefulWorkFromCylindersKwThisPump;
            totalHeatGeneratedOverallKw += Math.max(0, heatFromThisPumpSystemKw);

            systemSpecificResults.branches = processedBranchResults.reduce((obj, item) => { obj[item.branchName] = item; return obj; }, {});

            const collectorsOnScheme = modules.filter(m => m.type === 'collector');
            let commonDrainPathsDetails = {};
            for (const collector of collectorsOnScheme) {
                let totalFlowIntoThisCollectorM3s = 0;
                const collectorInstanceIdStr = String(collector.instanceId);

                processedBranchResults.forEach(pbr => {
                    if (pbr.cylinderCalculatedParams) {
                        const cylinderModuleInBranch = modules.find(m => String(m.instanceId) === String(pbr.cylinderCalculatedParams.cylinderInstanceId));
                        if (cylinderModuleInBranch) {
                            let lastDrainElementId = String(cylinderModuleInBranch.instanceId);
                            let pathLeadsToThisCollector = false;
                            const drainPathFromCylinder = findPathModules(String(cylinderModuleInBranch.instanceId), collectorInstanceIdStr, connections, modules, new Set([String(cylinderModuleInBranch.instanceId)]));

                            if (drainPathFromCylinder) {
                                if (drainPathFromCylinder.length > 0) {
                                    const elementBeforeCollectorInPath = drainPathFromCylinder[drainPathFromCylinder.length - 1];
                                    if (elementBeforeCollectorInPath) lastDrainElementId = String(elementBeforeCollectorInPath.instanceId);
                                }
                                const finalConnectionToCollector = connections.find(c =>
                                    String(c.sourceId) === lastDrainElementId &&
                                    String(c.targetId).startsWith(collectorInstanceIdStr + "_in")
                                );
                                if (finalConnectionToCollector) {
                                    pathLeadsToThisCollector = true;
                                }
                            }

                            if (pathLeadsToThisCollector) {
                                const cylProps = cylinderModuleInBranch.properties || {};
                                const D_piston = cylProps.pistonDiameter;
                                const d_rod = cylProps.rodDiameter;
                                let actualFlowToCylinderM3s = parseFloat(pbr.cylinderCalculatedParams.actualFlowToCylinderM3s);
                                let drainFlowForThisCylinderM3s = actualFlowToCylinderM3s;
                                if (D_piston && D_piston > 0) {
                                    const pistonArea = Math.PI * Math.pow(D_piston / 2, 2);
                                    const rodArea = (d_rod && d_rod > 0) ? Math.PI * Math.pow(d_rod / 2, 2) : 0;
                                    if (pistonArea > rodArea) {
                                        drainFlowForThisCylinderM3s = actualFlowToCylinderM3s * (pistonArea - rodArea) / pistonArea;
                                    }
                                }
                                totalFlowIntoThisCollectorM3s += drainFlowForThisCylinderM3s;
                            }
                        }
                    }
                });
                console.log(`  [КОЛЛЕКТОР ${collector.name}] Суммарный поток на входе: ${(totalFlowIntoThisCollectorM3s * 60000).toFixed(2)} л/мин.`);

                const pathFromCollectorToTank = findPathModules(collectorInstanceIdStr, String(tankModule.instanceId), connections, modules, new Set([collectorInstanceIdStr])) || [];
                if (totalFlowIntoThisCollectorM3s > 1e-9 && (pathFromCollectorToTank.length > 0 || connections.some(c => String(c.sourceId) === collectorInstanceIdStr && String(c.targetId) === String(tankModule.instanceId)))) {
                    let pathToCalc = pathFromCollectorToTank;
                    const commonDrainLineInfo = lineCalculations(
                        `${pumpSystemType}_ОбщийСлив_от_${collector.name.replace(/[()\s]/g, '')}`,
                        pathToCalc, totalFlowIntoThisCollectorM3s, 0.5,
                        fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
                    );
                    commonDrainPathsDetails[collectorInstanceIdStr] = commonDrainLineInfo.pipeDetails;
                }
            }
            systemSpecificResults.commonDrainPipesByCollector = commonDrainPathsDetails;
            systemResultsAccumulator[pump.name + "_" + pumpSystemType] = systemSpecificResults;
            console.log(`--- ЗАВЕРШЕНИЕ НАСОСА: ${pump.name}, Давление на выходе: ${systemSpecificResults.actualOutletPressureMPa} МПа, Потребл. мощность (на валу): ${pumpShaftPowerKw.toFixed(3)} кВт. Тепло от этой системы: ${heatFromThisPumpSystemKw.toFixed(3)} кВт ---`);
        }

        console.log(`\n--- Расчет теплового баланса ---`);
        console.log(`СУММАРНОЕ Тепловыделение (Q1): ${totalHeatGeneratedOverallKw.toFixed(3)} кВт`);

        if (!tankModule.properties) {
            return res.status(500).json({ error: "Внутренняя ошибка сервера: Отсутствуют свойства бака." });
        }
        const tankProps = tankModule.properties || {};
        const L = tankProps.length || 0.1, W = tankProps.width || 0.1, H = tankProps.height || 0.1;
        const tankOuterSurfaceM2 = 2 * (L * W + L * H + W * H);
        const tankHeatDissipationAreaM2 = 0.9 * tankOuterSurfaceM2;
        const totalHeatExchangeAreaM2 = totalEquipmentSurfaceOverallM2 + tankHeatDissipationAreaM2;

        let steadyStateTempC = environment.ambientTempC;
        if (environment.heatTransferCoeff > 0 && totalHeatExchangeAreaM2 > 0 && totalHeatGeneratedOverallKw > 0) {
            steadyStateTempC = (totalHeatGeneratedOverallKw * 1000) / (environment.heatTransferCoeff * totalHeatExchangeAreaM2) + environment.ambientTempC;
        } else if (totalHeatGeneratedOverallKw <= 0) {
            totalHeatGeneratedOverallKw = 0;
            steadyStateTempC = environment.ambientTempC;
        } else {
            steadyStateTempC = Infinity;
        }

        const finalCalculatedTempC = steadyStateTempC === Infinity ? null : parseFloat(steadyStateTempC.toFixed(1));
        const targetSteadyStateTempC = 70;
        let requiredTotalHeatExchangeAreaM2 = 0;
        let requiredTankAreaM2 = 0;
        let conclusion = "Ошибка определения достаточности бака.";
        const deltaTempForTargetC = targetSteadyStateTempC - environment.ambientTempC;

        if (totalHeatGeneratedOverallKw <= 0) {
            conclusion = `Тепло не выделяется или система охлаждается. Текущая площадь бака (${tankHeatDissipationAreaM2.toFixed(2)}м²) достаточна. Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Н/Д' : finalCalculatedTempC + '°C'}.`;
        } else if (deltaTempForTargetC > 0 && environment.heatTransferCoeff > 0) {
            requiredTotalHeatExchangeAreaM2 = (totalHeatGeneratedOverallKw * 1000) / (environment.heatTransferCoeff * deltaTempForTargetC);
            requiredTankAreaM2 = Math.max(0, requiredTotalHeatExchangeAreaM2 - totalEquipmentSurfaceOverallM2);
            if (tankHeatDissipationAreaM2 >= requiredTankAreaM2) {
                conclusion = `Текущая площадь бака (${tankHeatDissipationAreaM2.toFixed(2)}м²) ДОСТАТОЧНА для целевой темп. ${targetSteadyStateTempC}°C. Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность' : finalCalculatedTempC + '°C'}.`;
            } else {
                conclusion = `Текущая площадь бака (${tankHeatDissipationAreaM2.toFixed(2)}м²) НЕДОСТАТОЧНА для целевой темп. ${targetSteadyStateTempC}°C (требуется ${requiredTankAreaM2.toFixed(2)}м²). Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность' : finalCalculatedTempC + '°C'}. Вероятно, необходим радиатор.`;
            }
        } else if (deltaTempForTargetC <= 0) {
            conclusion = `Целевая температура (${targetSteadyStateTempC}°C) ниже или равна температуре окруж. среды (${environment.ambientTempC}°C). Бак достаточен. Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность' : finalCalculatedTempC + '°C'}.`;
        } else {
            conclusion = `Невозможно рассчитать требуемую площадь (коэф. теплопередачи ${environment.heatTransferCoeff}). Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность' : finalCalculatedTempC + '°C'}.`;
        }

        res.status(200).json({
            message: "Гидравлический расчет выполнен.",
            thermalBalance: {
                calculatedSteadyStateTempC: finalCalculatedTempC,
                requiredTankAreaM2: parseFloat(requiredTankAreaM2.toFixed(2)),
                currentEffectiveTankAreaM2: parseFloat(tankHeatDissipationAreaM2.toFixed(2)),
                totalHeatGeneratedKw: parseFloat(totalHeatGeneratedOverallKw.toFixed(3)),
                totalEquipmentSurfaceM2: parseFloat(totalEquipmentSurfaceOverallM2.toFixed(4)),
                ambientTempC: environment.ambientTempC,
                heatTransferCoeff: environment.heatTransferCoeff,
                conclusion: conclusion,
            },
            details: systemResultsAccumulator,
        });

    } catch (error) {
        console.error("Ошибка в /api/calculate-hydraulics:", error, error.stack);
        res.status(500).json({ error: error.message || "Произошла непредвиденная ошибка на сервере при расчете." });
    }
});

app.post('/api/schemes', async (req, res) => {
    try {
        const { name, data } = req.body;
        if (!name || !data || !Array.isArray(data.modules) || !Array.isArray(data.connections)) {
            return res.status(400).json({ error: 'Неверный формат данных. Требуется: name, data: { modules: [], connections: [] }' });
        }
        const newScheme = new Scheme({ name, data });
        await newScheme.save();
        res.status(201).json(newScheme);
    } catch (error) {
        console.error("Ошибка сохранения схемы:", error);
        res.status(500).json({ error: 'Не удалось сохранить схему', details: error.message });
    }
});

app.get('/api/schemes', async (req, res) => {
    try {
        const schemes = await Scheme.find().select('_id name updatedAt').sort('-updatedAt');
        res.status(200).json(schemes);
    } catch (error) {
        console.error("Ошибка получения списка схем:", error);
        res.status(500).json({ error: 'Не удалось получить список схем', details: error.message });
    }
});

app.get('/api/schemes/:id', async (req, res) => {
    try {
        const scheme = await Scheme.findById(req.params.id);
        if (!scheme) {
            return res.status(404).json({ error: 'Схема не найдена' });
        }
        res.status(200).json(scheme);
    } catch (error) {
        console.error("Ошибка получения схемы:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ error: 'Неверный формат ID схемы' });
        }
        res.status(500).json({ error: 'Не удалось получить схему', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});