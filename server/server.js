const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const dbURI = process.env.MONGO_URI;

const app = express();
const PORT = process.env.PORT || 5001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
mongoose.connect(dbURI)
  .then(() => console.log('MongoDB connection successful!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// --- Mongoose Schema ---
const SchemeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Имя схемы должно быть уникальным
    data: {
        modules: { type: Array, required: true },
        connections: { type: Array, required: true },
    },
}, { timestamps: true });

const Scheme = mongoose.model('Scheme', SchemeSchema);


// --- API Endpoints for Schemes (Create, Read, Update, Delete) ---
// ... (остальной код без изменений) ...
app.post('/api/schemes', async (req, res) => {
    try {
        const { name, data } = req.body;
        if (!name || !data || !Array.isArray(data.modules) || !Array.isArray(data.connections)) {
            return res.status(400).json({ error: 'Неверный формат данных. Требуется: name, data: { modules: [], connections: [] }' });
        }
        const existingScheme = await Scheme.findOne({ name: name });
        if (existingScheme) {
            return res.status(409).json({ error: 'Схема с таким именем уже существует.' });
        }
        const newScheme = new Scheme({ name, data });
        await newScheme.save();
        res.status(201).json(newScheme);
    } catch (error) {
        console.error("Ошибка сохранения схемы:", error);
         if (error.code === 11000) { 
             return res.status(409).json({ error: 'Схема с таким именем уже существует (ошибка индекса).', details: error.message });
        }
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

app.put('/api/schemes/:id', async (req, res) => {
    try {
        const { name, data } = req.body;
        if (!name || !data || !Array.isArray(data.modules) || !Array.isArray(data.connections)) {
            return res.status(400).json({ error: 'Неверный формат данных. Требуется: name, data: { modules: [], connections: [] }' });
        }
        
        if (name) {
            const existingSchemeWithName = await Scheme.findOne({ name: name, _id: { $ne: req.params.id } });
            if (existingSchemeWithName) {
                return res.status(409).json({ error: 'Схема с таким именем уже существует.' });
            }
        }

        const updatedScheme = await Scheme.findByIdAndUpdate(
            req.params.id,
            { name, data }, 
            { new: true, runValidators: true } 
        );

        if (!updatedScheme) {
            return res.status(404).json({ error: 'Схема для обновления не найдена' });
        }
        res.status(200).json(updatedScheme);
    } catch (error) {
        console.error("Ошибка обновления схемы:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ error: 'Неверный формат ID схемы' });
        }
         if (error.code === 11000) {
             return res.status(409).json({ error: 'Схема с таким именем уже существует (ошибка индекса).', details: error.message });
        }
        res.status(500).json({ error: 'Не удалось обновить схему', details: error.message });
    }
});

app.delete('/api/schemes/:id', async (req, res) => {
    try {
        const deletedScheme = await Scheme.findByIdAndDelete(req.params.id);
        if (!deletedScheme) {
            return res.status(404).json({ error: 'Схема для удаления не найдена' });
        }
        res.status(200).json({ message: 'Схема успешно удалена', _id: req.params.id });
    } catch (error) {
        console.error("Ошибка удаления схемы:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ error: 'Неверный формат ID схемы' });
        }
        res.status(500).json({ error: 'Не удалось удалить схему', details: error.message });
    }
});

// --- Utility Functions for Pathfinding ---

/**
 * Находит следующий модуль в цепи по ID исходного порта/модуля.
 */
function findNextModuleInstance(sourceIdOrPort, connections, modules) {
    const sourceIdToSearch = String(sourceIdOrPort);
    const connection = connections.find(conn => String(conn.sourceId) === sourceIdToSearch);
    if (!connection) {
        return null;
    }
    let targetModuleId = String(connection.targetId);
    if (targetModuleId.includes('_in')) {
        targetModuleId = targetModuleId.split('_in')[0];
    }
    return modules.find(m => String(m.instanceId) === targetModuleId);
}

/**
 * Рекурсивно ищет путь от startModuleInstanceId до endModuleInstanceId.
 * Возвращает массив модулей, составляющих путь, включая конечный узел, но не включая начальный.
 * Если startModuleInstanceId == endModuleInstanceId, вернет массив с этим одним узлом.
 * Если путь не найден, вернет null.
 */
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
    const currentModule = modules.find(m => String(m.instanceId) === currentIdStr);

    if (!currentModule) return null; 

    if (currentIdStr === endIdStr) {
        return [currentModule]; 
    }

    visited.add(currentIdStr);
    let shortestPath = null;
    let outgoingConnections = [];

    if (currentModule.type === 'splitter') {
        if (currentSplitterPortForThisPath && String(currentModule.instanceId) === String(currentSplitterPortForThisPath.split('_out')[0])) {
            const specificOutputConn = connections.find(conn => String(conn.sourceId) === String(currentSplitterPortForThisPath));
            if (specificOutputConn) outgoingConnections = [specificOutputConn];
            else return null;
        } else {
            outgoingConnections = connections.filter(conn => String(conn.sourceId).startsWith(currentIdStr + "_out"));
        }
    } else {
        outgoingConnections = connections.filter(conn => String(conn.sourceId) === currentIdStr);
    }

    for (const conn of outgoingConnections) {
        let nextModuleInstanceIdRaw = conn.targetId;
        let actualNextModuleIdForFind = String(nextModuleInstanceIdRaw);
        if (typeof nextModuleInstanceIdRaw === 'string' && nextModuleInstanceIdRaw.includes('_in')) {
            actualNextModuleIdForFind = nextModuleInstanceIdRaw.split('_in')[0];
        }

        if (visited.has(actualNextModuleIdForFind)) continue;

        const nextModule = modules.find(m => String(m.instanceId) === actualNextModuleIdForFind);
        if (!nextModule) continue;

        if (actualNextModuleIdForFind === endIdStr) {
            if (shortestPath === null || [nextModule].length < shortestPath.length) {
                shortestPath = [nextModule];
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


// --- Hydraulic Calculation Functions ---
function calculateVelocity(flowM3s, pipeDiameterM) {
    if (!pipeDiameterM || pipeDiameterM <= 0) return 0;
    const area = Math.PI * Math.pow(pipeDiameterM / 2, 2);
    if (area === 0) return Infinity;
    // Действительная скорость жидкости в гидролинии
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
        if (term <=0) return 0.1; 
        return 0.11 * Math.pow(term, 0.25);
    }
}
function calculateFrictionLoss(lambda, lengthM, diameterM, densityKgm3, velocityMs) {
    if (!diameterM || diameterM <= 0 || velocityMs === Infinity) return Infinity;
    // Потери давления по длине (путевые)
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
function calculateOverallMechanicalEfficiency(modulesInPath) {
    let overallMechEff = 1.0;
    modulesInPath.forEach(module => {
        const props = module.properties || {};
        // <--- ИЗМЕНЕНО: Добавлен тип 'motor'
        if ((module.type === 'pump' || module.type === 'cylinder' || module.type === 'motor') && typeof props.mechEff === 'number') {
            overallMechEff *= props.mechEff;
        }
    });
    return Math.max(0.1, overallMechEff); 
}
function calculateOverallVolumetricEfficiency(
    modulesRelevantToPath, primaryFlowIntoPathM3s, drainFlowFromActuatorM3s, // <--- ИЗМЕНЕНО: drainFlowFromCylinderM3s -> drainFlowFromActuatorM3s
    isActuatorOnThisPath, pressurePathCompInstanceIds, drainPathCompInstanceIds // <--- ИЗМЕНЕНО: isCylinderOnThisPath -> isActuatorOnThisPath
) {
    let overallVolEff = 1.0;
    const pumpModule = modulesRelevantToPath.find(m => m.type === 'pump');
    if (pumpModule && pumpModule.properties && typeof pumpModule.properties.volumetricEff === 'number') {
        overallVolEff *= pumpModule.properties.volumetricEff;
    }

    // <--- НОВОЕ: Учет объемного КПД для цилиндра или мотора
    const actuatorModule = modulesRelevantToPath.find(m => m.type === 'cylinder' || m.type === 'motor');
    if (isActuatorOnThisPath && actuatorModule && actuatorModule.properties && typeof actuatorModule.properties.volEff === 'number') {
        overallVolEff *= actuatorModule.properties.volEff;
    }
    // <--- КОНЕЦ НОВОГО

    modulesRelevantToPath.forEach(module => {
        const props = module.properties || {};
        // <--- ИЗМЕНЕНО: Исключаем также 'motor' из расчета утечек по internalLeakage, так как его volEff учтен выше
        if (module.type !== 'pump' && module.type !== 'cylinder' && module.type !== 'motor' && typeof props.internalLeakage === 'number') {
            const leakageLmin = props.internalLeakage;
            if (leakageLmin > 0) {
                const leakageM3s = leakageLmin / 60000;
                let flowThroughThisComponentM3s = 0;
                if (pressurePathCompInstanceIds.includes(String(module.instanceId))) {
                    flowThroughThisComponentM3s = primaryFlowIntoPathM3s;
                } else if (isActuatorOnThisPath && drainPathCompInstanceIds.includes(String(module.instanceId))) { // <--- ИЗМЕНЕНО
                    flowThroughThisComponentM3s = drainFlowFromActuatorM3s; // <--- ИЗМЕНЕНО
                } else if (!isActuatorOnThisPath && drainPathCompInstanceIds.includes(String(module.instanceId))) { // <--- ИЗМЕНЕНО
                    flowThroughThisComponentM3s = primaryFlowIntoPathM3s; 
                } else { return; }
                if (flowThroughThisComponentM3s > leakageM3s) {
                    overallVolEff *= (flowThroughThisComponentM3s - leakageM3s) / flowThroughThisComponentM3s;
                } else if (flowThroughThisComponentM3s > 0) { overallVolEff = 0; }
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
// <--- НОВОЕ: Функция для расчета перепада давления на гидромоторе
function calculateMotorPressureDrop(motorModule) {
    if (!motorModule || !motorModule.properties) return 0;
    const props = motorModule.properties;
    const requiredTorqueNm = props.requiredTorque || 0;
    const motorWorkingVolumeM3 = (props.workingVolume || 0) * 1e-6; // см³/об в м³/об
    const motorMechEff = props.mechEff || 0.9;

    if (requiredTorqueNm <= 0) return 0; // Если момент не требуется, перепад не нужен (кроме потерь в сливной)
    if (motorWorkingVolumeM3 <= 0 || motorMechEff <= 0) return Infinity; // Неверные параметры

    // M = (deltaP * V_раб_за_оборот * η_мех_мотора) / (2 * PI)
    // deltaP = (M_требуемый * 2 * PI) / (V_раб_за_оборот * η_мех_мотора)
    return (requiredTorqueNm * 2 * Math.PI) / (motorWorkingVolumeM3 * motorMechEff);
}


const lineCalculations = (
    lineDescription, modulesOnPath, flowM3s, defaultOverallZetaForLine,
    fluidProperties, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
) => {
    console.log(`  [${lineDescription}] Расчет потерь. Поток: ${(flowM3s * 60000).toFixed(2)} л/мин.`);
    let totalFrictionLossPa = 0;
    let totalLocalLossPaOnPipes = 0; 
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
            totalLocalLossPaOnPipes += localLossInPipe;
            pipeDetailsArray.push({
                instanceId: pipe.instanceId, name: pipe.name || 'Трубопровод',
                diameterM: parseFloat(diameter.toFixed(4)), lengthM: parseFloat(length.toFixed(2)),
                velocityMs: parseFloat(velocity.toFixed(3)), reynolds: parseFloat(reynolds.toFixed(0)),
                lambda: parseFloat(lambda.toFixed(4)), frictionLossPa: parseFloat(frictionLoss.toFixed(0)),
                localLossInPipePa: parseFloat(localLossInPipe.toFixed(0)),
            });
        });
    }
    let additionalLocalLossesPa = 0;
    if (defaultOverallZetaForLine > 0) {
        const averageVelocityOverallForZeta = pipeCount > 0 ? sumVelocities / pipeCount : calculateVelocity(flowM3s, DEFAULT_PIPE_DIAMETER);
        const averageReynoldsOverallForZeta = calculateReynoldsNumber(averageVelocityOverallForZeta, DEFAULT_PIPE_DIAMETER, fluidProperties.kinematicViscosityM2s);
        additionalLocalLossesPa = calculateLocalLoss(defaultOverallZetaForLine, fluidProperties.density, averageVelocityOverallForZeta, averageReynoldsOverallForZeta);
    }
    const totalLocalLossPa = totalLocalLossPaOnPipes + additionalLocalLossesPa;
    const averageVelocityOverall = pipeCount > 0 ? sumVelocities / pipeCount : calculateVelocity(flowM3s, DEFAULT_PIPE_DIAMETER);
    return {
        totalFrictionLossPa, totalLocalLossPa,
        averageVelocityOverallMs: averageVelocityOverall, pipeDetails: pipeDetailsArray,
    };
};

function discoverBranchesRecursive(
    currentNode, currentFlowM3s, pathFromLastSplitterOrPump, initialPressureComponentsForThisBranch,
    pumpSystemType, connections, modules, tankId, branchesArrayOutput,
    visitedOnThisTraceSet, originalPumpFlowM3s, currentBranchNamePrefix
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
                        nextNodeAfterSplitter, flowPerSplitterOutput, [],
                        [...initialPressureComponentsForThisBranch, ...pathFromLastSplitterOrPump, splitter],
                        pumpSystemType, connections, modules, tankId, branchesArrayOutput,
                        new Set(visitedOnThisTraceSet), originalPumpFlowM3s, newBranchNamePrefix
                    );
                }
            });
        } else { 
            console.warn(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Разветвитель ${splitter.name} не имеет выходных соединений. Считаем тупиком.`);
            const entryNode = pathFromLastSplitterOrPump.length > 0 ? pathFromLastSplitterOrPump[0] : splitter;
            branchesArrayOutput.push({
                branchName: `${currentBranchNamePrefix}_тупик_у_${splitter.name.replace(/[()\s]/g, '')}`,
                entryNodeInstanceId: entryNode.instanceId, 
                actualEntryNodeForPathCalc: splitter, 
                flowM3s: currentFlowM3s, 
                initialComponentsOnPressurePath: initialPressureComponentsForThisBranch,
                entrySplitterPortId: null, 
                isDeadEnd: true, 
                deadEndMessage: `Разветвитель "${splitter.name}" (ID: ${splitter.instanceId}) не имеет выходных соединений.`
            });
        }
    // <--- ИЗМЕНЕНО: Добавлено условие currentNode.type === 'motor'
    } else if (currentNode.type === 'cylinder' || currentNode.type === 'motor' || currentNodeIdStr === String(tankId)) { 
        console.log(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Узел ${currentNode.name} - конечный потребитель/бак. Создание ветки.`);
        const entryNodeForThisDefinedBranch = pathFromLastSplitterOrPump.length > 0 ? pathFromLastSplitterOrPump[0] : currentNode;
        let originatingSplitterPort = null;
        if (initialPressureComponentsForThisBranch.length > 0) {
            const lastComponentInInitialOrCommon = initialPressureComponentsForThisBranch[initialPressureComponentsForThisBranch.length - 1];
            if (lastComponentInInitialOrCommon.type === 'splitter') {
                const connToEntry = connections.find(c => {
                    let targetId = String(c.targetId).split('_')[0];
                    return String(c.sourceId).startsWith(String(lastComponentInInitialOrCommon.instanceId) + "_out") &&
                           targetId === String(entryNodeForThisDefinedBranch.instanceId);
                });
                if (connToEntry) originatingSplitterPort = connToEntry.sourceId;
            }
        }
        branchesArrayOutput.push({
            branchName: currentBranchNamePrefix,
            entryNodeInstanceId: entryNodeForThisDefinedBranch.instanceId,
            actualEntryNodeForPathCalc: currentNode, // Конечный узел этой ветки (цилиндр, мотор или бак)
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
                    nextNode, currentFlowM3s, [...pathFromLastSplitterOrPump, currentNode],
                    initialPressureComponentsForThisBranch, pumpSystemType, connections, modules,
                    tankId, branchesArrayOutput, new Set(visitedOnThisTraceSet),
                    originalPumpFlowM3s, currentBranchNamePrefix
                );
            } else { 
                const entryNode = pathFromLastSplitterOrPump.length > 0 ? pathFromLastSplitterOrPump[0] : currentNode;
                console.warn(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Обрыв после ${currentNode.name}.`);
                branchesArrayOutput.push({ 
                    branchName: `${currentBranchNamePrefix}_обрыв_у_${currentNode.name.replace(/[()\s]/g, '')}`, 
                    entryNodeInstanceId: entryNode.instanceId, 
                    actualEntryNodeForPathCalc: currentNode, 
                    flowM3s: currentFlowM3s, 
                    initialComponentsOnPressurePath: initialPressureComponentsForThisBranch, 
                    isBrokenPath: true, 
                    brokenPathMessage: `Обрыв цепи после модуля "${currentNode.name}" (ID: ${currentNode.instanceId}).`
                });
            }
        } else if (nextConnections.length > 1) {
            console.error(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Ошибка! Узел ${currentNode.name} (тип: ${currentNode.type}) не разветвитель, но имеет ${nextConnections.length} выходов.`);
        } else { 
            const entryNode = pathFromLastSplitterOrPump.length > 0 ? pathFromLastSplitterOrPump[0] : currentNode;
            console.warn(`  [discoverBranchesRecursive] ${currentBranchNamePrefix}: Тупик после ${currentNode.name}.`);
            branchesArrayOutput.push({ 
                branchName: `${currentBranchNamePrefix}_тупик_у_${currentNode.name.replace(/[()\s]/g, '')}`, 
                entryNodeInstanceId: entryNode.instanceId, 
                actualEntryNodeForPathCalc: currentNode, 
                flowM3s: currentFlowM3s, 
                initialComponentsOnPressurePath: initialPressureComponentsForThisBranch,
                isDeadEnd: true, 
                deadEndMessage: `Тупик после модуля "${currentNode.name}" (ID: ${currentNode.instanceId}). Следующий элемент не найден.`
            });
        }
    }
}

// --- Main API Endpoint ---
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

        const defaultFluid = { density: 868, kinematicViscosityM2s: 33.2e-6 };
        const fluid = req.body.fluidProperties ? 
            {
                density: parseFloat(req.body.fluidProperties.density) || defaultFluid.density,
                kinematicViscosityM2s: parseFloat(req.body.fluidProperties.kinematicViscosityM2s) || defaultFluid.kinematicViscosityM2s
            } 
            : defaultFluid;
        console.log("Используемые свойства жидкости:", fluid); // Для отладки        
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
            const singlePumpResults = await processSinglePump(
                pump, modules, connections, tankModule, currentEngineRpm, 
                fluid, environment, 
                DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
            );
            systemResultsAccumulator[pump.name + "_" + (pump.system || 'unknown_system')] = singlePumpResults;
            if (singlePumpResults && typeof singlePumpResults.heatFromThisPumpSystemKw === 'number') {
                totalHeatGeneratedOverallKw += Math.max(0, singlePumpResults.heatFromThisPumpSystemKw);
            }
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
            conclusion = `Тепло не выделяется или система охлаждается. Текущая площадь бака (${tankHeatDissipationAreaM2.toFixed(2)}м²) достаточна. Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Н/Д (нет тепловыделения)' : finalCalculatedTempC + '°C'}.`;
        } else if (deltaTempForTargetC > 0 && environment.heatTransferCoeff > 0) {
            requiredTotalHeatExchangeAreaM2 = (totalHeatGeneratedOverallKw * 1000) / (environment.heatTransferCoeff * deltaTempForTargetC);
            requiredTankAreaM2 = Math.max(0, requiredTotalHeatExchangeAreaM2 - totalEquipmentSurfaceOverallM2);
            if (tankHeatDissipationAreaM2 >= requiredTankAreaM2) {
                conclusion = `Текущая площадь бака (${tankHeatDissipationAreaM2.toFixed(2)}м²) ДОСТАТОЧНА для целевой темп. ${targetSteadyStateTempC}°C. Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность (недостаточное охлаждение)' : finalCalculatedTempC + '°C'}.`;
            } else {
                conclusion = `Текущая площадь бака (${tankHeatDissipationAreaM2.toFixed(2)}м²) НЕДОСТАТОЧНА для целевой темп. ${targetSteadyStateTempC}°C (требуется ${requiredTankAreaM2.toFixed(2)}м²). Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность (недостаточное охлаждение)' : finalCalculatedTempC + '°C'}. Вероятно, необходим радиатор.`;
            }
        } else if (deltaTempForTargetC <= 0) {
            conclusion = `Целевая температура (${targetSteadyStateTempC}°C) ниже или равна температуре окруж. среды (${environment.ambientTempC}°C). Бак достаточен, если текущая расчетная температура не превышает целевую. Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность (недостаточное охлаждение)' : finalCalculatedTempC + '°C'}.`;
             if (finalCalculatedTempC !== null && finalCalculatedTempC > targetSteadyStateTempC) {
                conclusion += ` Однако, расчетная температура (${finalCalculatedTempC}°C) выше целевой, вероятно нужен радиатор.`
            }
        } else { 
            conclusion = `Невозможно рассчитать требуемую площадь (коэф. теплопередачи ${environment.heatTransferCoeff}). Расчетная уст. темп.: ${finalCalculatedTempC === null ? 'Бесконечность (недостаточное охлаждение)' : finalCalculatedTempC + '°C'}.`;
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


/**
 * Processes all hydraulic calculations for a single pump and its associated system.
 */
async function processSinglePump(pump, modules, connections, tankModule, currentEngineRpm, fluid, environment, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS) {
    const pumpProps = pump.properties || {};
    const pumpSystemType = pump.system || 'unknown_system';
    const pumpInstanceIdStr = String(pump.instanceId);
    
    const systemSpecificResults = {
        pumpFlowLmin: 0, pumpFlowM3s: 0, actualOutletPressureMPa: 0, powerInputKw: 0,
        overallSystemEfficiency: 0, systemHydraulicEfficiencyGlobal: 0, systemVolumetricEfficiencyGlobal: 0,
        branches: {}, commonDrainPipesByCollector: {}, suctionLinePipeDetails: [], commonPathPipeDetails: [],
        schemaWarnings: [],
        problematicModuleIds: [] 
    };

    // Частота вращения вала насоса
    const pumpRpm = currentEngineRpm * (pumpProps.driveRatio || 1);
    const pumpVolEff = pumpProps.volumetricEff || 0.9;
    const pumpWorkingVolumeM3 = (pumpProps.workingVolume || 0) * 1e-6;

    if (pumpWorkingVolumeM3 <= 0) {
        console.warn(`[${pumpSystemType.toUpperCase()}] Насос ${pump.name} имеет неверный рабочий объем. Пропуск.`);
        systemSpecificResults.error = "Неверный рабочий объем насоса.";
        systemSpecificResults.schemaWarnings.push(`Насос "${pump.name}" (ID: ${pump.instanceId}) имеет неверный рабочий объем.`);
        if(!systemSpecificResults.problematicModuleIds.includes(pump.instanceId)) systemSpecificResults.problematicModuleIds.push(pump.instanceId);
        return systemSpecificResults;
    }

    // Уточнение действительной подачи насоса
    // pumpWorkingVolumeM3 – это действительный рабочий объем насоса (в м³/об), 
    // pumpRpm / 60 – это действительная частота вращения вала насоса (в об/с), 
    // pumpVolEff – это объемный КПД насоса
    const pumpNominalFlowM3s = (pumpWorkingVolumeM3 * (pumpRpm / 60)) * pumpVolEff;
    systemSpecificResults.pumpFlowLmin = parseFloat((pumpNominalFlowM3s * 60000).toFixed(2));
    systemSpecificResults.pumpFlowM3s = pumpNominalFlowM3s;

    const suctionConnection = connections.find(c => String(c.targetId) === pumpInstanceIdStr);
    if (!suctionConnection) {
        console.warn(`[${pumpSystemType.toUpperCase()}] Для насоса ${pump.name} не найдено всасывающего соединения.`);
        systemSpecificResults.schemaWarnings.push(`Насос "${pump.name}" (ID: ${pump.instanceId}) не имеет всасывающей линии.`);
        if(!systemSpecificResults.problematicModuleIds.includes(pump.instanceId)) systemSpecificResults.problematicModuleIds.push(pump.instanceId);
    } else {
        const suctionSourceModule = modules.find(m => String(m.instanceId) === String(suctionConnection.sourceId).split('_out')[0]);
        let suctionLineComponentsToCalculate = [];
        if (suctionSourceModule && suctionSourceModule.type === 'pipe') {
            suctionLineComponentsToCalculate.push(suctionSourceModule);
        } else if (suctionSourceModule && suctionSourceModule.type !== 'tank_output') {
             console.warn(`[${pumpSystemType.toUpperCase()}] Всасывающая линия насоса ${pump.name} подключена к ${suctionSourceModule.type}, а не трубе/баку.`);
            let pathFromTankToPump = findPathModules(String(tankModule.instanceId), pumpInstanceIdStr, connections, modules, new Set());
            if (pathFromTankToPump) { 
                suctionLineComponentsToCalculate = pathFromTankToPump.filter(m => m.type === 'pipe' && String(m.instanceId) !== pumpInstanceIdStr);
            }
        }
        if (suctionLineComponentsToCalculate.length > 0) {
            const suctionLossInfo = lineCalculations(
                `${pumpSystemType}_ВсасывающаяЛиния`, suctionLineComponentsToCalculate, pumpNominalFlowM3s,
                0.5, fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
            );
            systemSpecificResults.suctionLinePipeDetails = suctionLossInfo.pipeDetails;
            console.log(`  [${pumpSystemType.toUpperCase()}] Потери на всасывающей линии: ~${((suctionLossInfo.totalFrictionLossPa + suctionLossInfo.totalLocalLossPa) / 1e6).toFixed(4)} МПа`);
        }
    }

    let commonPathFromPump = [];
    let firstActiveNodeOrSplitterAfterCommonPath = null;
    let commonPathLossesPa = 0;
    const directPumpOutputsConnections = connections.filter(c => String(c.sourceId) === pumpInstanceIdStr);

    if (directPumpOutputsConnections.length === 0) {
        console.warn(`[${pumpSystemType.toUpperCase()}] Насос ${pump.name} не имеет выходных соединений.`);
        systemSpecificResults.schemaWarnings.push(`Насос "${pump.name}" (ID: ${pump.instanceId}) не имеет выходных соединений.`);
        if(!systemSpecificResults.problematicModuleIds.includes(pump.instanceId)) systemSpecificResults.problematicModuleIds.push(pump.instanceId);
    } else if (directPumpOutputsConnections.length === 1) {
        let currentNodeId = String(directPumpOutputsConnections[0].targetId).split('_')[0];
        let currentNode = modules.find(m => String(m.instanceId) === currentNodeId);
        let tempPath = [];
        let visitedTracer = new Set();
        while (currentNode && !visitedTracer.has(String(currentNode.instanceId))) {
            visitedTracer.add(String(currentNode.instanceId));
            // <--- ИЗМЕНЕНО: Добавлен 'motor' в список активных узлов
            if (['splitter', 'cylinder', 'motor', 'tank_output', 'collector', 'distributor', 'block', 'filter'].includes(currentNode.type)) {
                firstActiveNodeOrSplitterAfterCommonPath = currentNode;
                break;
            }
            tempPath.push(currentNode);
            const nextModule = findNextModuleInstance(currentNode.instanceId, connections, modules);
            if (!nextModule) { firstActiveNodeOrSplitterAfterCommonPath = currentNode; break; }
            currentNode = nextModule;
        }
        if (!firstActiveNodeOrSplitterAfterCommonPath && tempPath.length > 0) firstActiveNodeOrSplitterAfterCommonPath = tempPath[tempPath.length-1];
        else if (!firstActiveNodeOrSplitterAfterCommonPath && tempPath.length === 0) firstActiveNodeOrSplitterAfterCommonPath = modules.find(m => String(m.instanceId) === String(directPumpOutputsConnections[0].targetId).split('_')[0]);
        commonPathFromPump = tempPath;
    } else { 
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
    }
    console.log(`[${pumpSystemType.toUpperCase()}] Потери на общем участке до '${firstActiveNodeOrSplitterAfterCommonPath?.name || 'конца'}': ${(commonPathLossesPa / 1e6).toFixed(4)} МПа`);

    let branchesToProcess = [];
    if (firstActiveNodeOrSplitterAfterCommonPath) {
        if (firstActiveNodeOrSplitterAfterCommonPath.instanceId === pump.instanceId && directPumpOutputsConnections.length > 1) {
            const flowPerDirectOutput = pumpNominalFlowM3s / directPumpOutputsConnections.length;
            directPumpOutputsConnections.forEach((conn, index) => {
                const nextNodeAfterPump = modules.find(m => String(m.instanceId) === String(conn.targetId).split('_')[0]);
                if (nextNodeAfterPump) {
                    discoverBranchesRecursive(nextNodeAfterPump, flowPerDirectOutput, [], [], pumpSystemType, connections, modules, String(tankModule.instanceId), branchesToProcess, new Set(), pumpNominalFlowM3s, `${pumpSystemType}_directOut${index}_to_${nextNodeAfterPump.name.replace(/[()\s]/g, '')}`);
                }
            });
        } else {
            discoverBranchesRecursive(firstActiveNodeOrSplitterAfterCommonPath, pumpNominalFlowM3s, [], commonPathFromPump, pumpSystemType, connections, modules, String(tankModule.instanceId), branchesToProcess, new Set(), pumpNominalFlowM3s, `${pumpSystemType}_отАктивного_${firstActiveNodeOrSplitterAfterCommonPath.name.replace(/[()\s]/g, '')}`);
        }
    } else if (directPumpOutputsConnections.length > 0) { 
         console.warn(`[${pumpSystemType.toUpperCase()}] Общий путь от насоса не привел к распознаваемому активному узлу или разветвителю.`);
    }

    const uniqueBranches = [];
    const uniqueKeys = new Set();
    for (const branch of branchesToProcess) {
        const endConsumerForBranch = modules.find(m => String(m.instanceId) === String(branch.actualEntryNodeForPathCalc.instanceId));
        const key = `${branch.entryNodeInstanceId}_to_${endConsumerForBranch?.instanceId}_via_${(branch.initialComponentsOnPressurePath || []).map(c => c.instanceId).join(',')}_port_${branch.entrySplitterPortId || 'none'}_flow_${branch.flowM3s.toExponential(3)}`;
        if (!uniqueKeys.has(key)) {
            uniqueKeys.add(key);
            uniqueBranches.push(branch);
        }
    }
    branchesToProcess = uniqueBranches;

    if (branchesToProcess.filter(b => !b.isDeadEnd && !b.isBrokenPath).length === 0 && directPumpOutputsConnections.length > 0) {
        systemSpecificResults.schemaWarnings.push(`Насос "${pump.name}" (ID: ${pump.instanceId}): не найдено УНИКАЛЬНЫХ активных (не тупиковых/оборванных) веток после анализа схемы.`);
         if(!systemSpecificResults.problematicModuleIds.includes(pump.instanceId)) systemSpecificResults.problematicModuleIds.push(pump.instanceId);
    }
    console.log(`[${pumpSystemType.toUpperCase()}] Найдено ${branchesToProcess.length} УНИКАЛЬНЫХ веток для насоса ${pump.name}: ${branchesToProcess.map(b => b.branchName).join(', ')}`);
    
    let maxRequiredPressureAtPumpOutletPa = 0;
    const processedBranchResults = [];
    // <--- ИЗМЕНЕНЫ ИМЕНА ПЕРЕМЕННЫХ
    let sumOfUsefulWorkFromActuatorsKwThisPump = 0; 
    let sumOfActualFlowThroughActuatorsM3sThisPump = 0;
    let sumOfHydraulicUsefulPowerAtActuatorsPaM3s = 0; 

    for (const branch of branchesToProcess) {
        const branchDetails = calculateBranchDetails(
            branch, pumpNominalFlowM3s, commonPathLossesPa, commonPathFromPump, 
            modules, connections, tankModule, fluid, 
            DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS, 
            pumpSystemType
        );
        processedBranchResults.push(branchDetails);

        if (branchDetails.isDeadEnd || branchDetails.isBrokenPath) continue;

        if (branchDetails.pressureAtPumpOutletForThisBranchTotal) {
            maxRequiredPressureAtPumpOutletPa = Math.max(maxRequiredPressureAtPumpOutletPa, branchDetails.pressureAtPumpOutletForThisBranchTotal);
        }
        // <--- НОВОЕ: Учет полезной работы от моторов
        if (branchDetails.cylinderCalculatedParams && typeof branchDetails.cylinderCalculatedParams.usefulPowerKw === 'number') {
            sumOfUsefulWorkFromActuatorsKwThisPump += branchDetails.cylinderCalculatedParams.usefulPowerKw;
        } else if (branchDetails.motorCalculatedParams && typeof branchDetails.motorCalculatedParams.usefulPowerKw === 'number') {
            sumOfUsefulWorkFromActuatorsKwThisPump += branchDetails.motorCalculatedParams.usefulPowerKw;
        }

        // <--- НОВОЕ: Учет фактического потока через моторы
        if (branchDetails.cylinderCalculatedParams && typeof branchDetails.cylinderCalculatedParams.actualFlowToCylinderM3s === 'number') {
            sumOfActualFlowThroughActuatorsM3sThisPump += branchDetails.cylinderCalculatedParams.actualFlowToCylinderM3s;
        } else if (branchDetails.motorCalculatedParams && typeof branchDetails.motorCalculatedParams.actualFlowToMotorM3s === 'number') {
            sumOfActualFlowThroughActuatorsM3sThisPump += branchDetails.motorCalculatedParams.actualFlowToMotorM3s;
        }
        
        // <--- НОВОЕ: Учет полезной гидравлической мощности на моторах
        if (branchDetails.hydraulicUsefulPowerAtCylinderPaM3s) {
            sumOfHydraulicUsefulPowerAtActuatorsPaM3s += branchDetails.hydraulicUsefulPowerAtCylinderPaM3s;
        } else if (branchDetails.hydraulicUsefulPowerAtMotorPaM3s) { // Предполагаем, что это поле будет добавлено в branchDetails для моторов
            sumOfHydraulicUsefulPowerAtActuatorsPaM3s += branchDetails.hydraulicUsefulPowerAtMotorPaM3s;
        }
    }
    systemSpecificResults.branches = processedBranchResults.reduce((obj, item) => { obj[item.branchName] = item; return obj; }, {});
    
    if (branchesToProcess.length > 0 && branchesToProcess.every(b => b.isDeadEnd || b.isBrokenPath)) {
        maxRequiredPressureAtPumpOutletPa = commonPathLossesPa; 
        systemSpecificResults.schemaWarnings.push(`Все ветки от насоса "${pump.name}" (ID: ${pump.instanceId}) являются тупиковыми или оборванными. Давление ограничено потерями на общем участке.`);
         if(!systemSpecificResults.problematicModuleIds.includes(pump.instanceId)) systemSpecificResults.problematicModuleIds.push(pump.instanceId);
    } else if (branchesToProcess.length === 0 && directPumpOutputsConnections.length > 0) {
        maxRequiredPressureAtPumpOutletPa = commonPathLossesPa;
    }

    systemSpecificResults.actualOutletPressureMPa = parseFloat((maxRequiredPressureAtPumpOutletPa / 1e6).toFixed(3));
    const pumpMechEffFinal = pumpProps.mechEff || 0.85;
    const pumpShaftPowerKw = Math.max(0, (maxRequiredPressureAtPumpOutletPa * pumpNominalFlowM3s) / pumpMechEffFinal / 1000);
    systemSpecificResults.powerInputKw = parseFloat(pumpShaftPowerKw.toFixed(3));

    if (pumpShaftPowerKw > 1e-5) {
        // <--- ИЗМЕНЕНО: Используем sumOfUsefulWorkFromActuatorsKwThisPump
        systemSpecificResults.overallSystemEfficiency = parseFloat(Math.max(0, Math.min(1, (sumOfUsefulWorkFromActuatorsKwThisPump / pumpShaftPowerKw))).toFixed(4));
    } else {
        systemSpecificResults.overallSystemEfficiency = (sumOfUsefulWorkFromActuatorsKwThisPump > 0) ? 0 : 1;
    }

    const pumpHydraulicOutputPowerKwAtActualPressure = (maxRequiredPressureAtPumpOutletPa * pumpNominalFlowM3s) / 1000;
    // <--- ИЗМЕНЕНО: Используем sumOfHydraulicUsefulPowerAtActuatorsPaM3s
    const usefulHydraulicPowerAtActuatorsKw = sumOfHydraulicUsefulPowerAtActuatorsPaM3s / 1000;
    if (pumpHydraulicOutputPowerKwAtActualPressure > 1e-5) {
        systemSpecificResults.systemHydraulicEfficiencyGlobal = parseFloat(Math.max(0, Math.min(1, (usefulHydraulicPowerAtActuatorsKw / pumpHydraulicOutputPowerKwAtActualPressure))).toFixed(3));
    } else {
        systemSpecificResults.systemHydraulicEfficiencyGlobal = (usefulHydraulicPowerAtActuatorsKw > 0) ? 0 : 1;
    }
    
    if (pumpNominalFlowM3s > 1e-9) {
        // <--- ИЗМЕНЕНО: Используем sumOfActualFlowThroughActuatorsM3sThisPump
        systemSpecificResults.systemVolumetricEfficiencyGlobal = parseFloat(Math.max(0, Math.min(1, (sumOfActualFlowThroughActuatorsM3sThisPump / pumpNominalFlowM3s)))).toFixed(3);
    } else {
        systemSpecificResults.systemVolumetricEfficiencyGlobal = (sumOfActualFlowThroughActuatorsM3sThisPump > 0) ? 0 : 1;
    }
    
    // <--- ИЗМЕНЕНО: Используем sumOfUsefulWorkFromActuatorsKwThisPump
    systemSpecificResults.heatFromThisPumpSystemKw = pumpShaftPowerKw - sumOfUsefulWorkFromActuatorsKwThisPump;
    console.log(`--- ЗАВЕРШЕНИЕ НАСОСА: ${pump.name}, Давление на выходе: ${systemSpecificResults.actualOutletPressureMPa} МПа, Потребл. мощность (на валу): ${pumpShaftPowerKw.toFixed(3)} кВт. Тепло от этой системы: ${systemSpecificResults.heatFromThisPumpSystemKw.toFixed(3)} кВт ---`);
    
    const collectorsOnScheme = modules.filter(m => m.type === 'collector');
    let commonDrainPathsDetails = {};
    for (const collector of collectorsOnScheme) {
        let totalFlowIntoThisCollectorM3s = 0;
        const collectorInstanceIdStr = String(collector.instanceId);
        processedBranchResults.forEach(pbr => {
            // <--- НОВОЕ: Учет слива от моторов в коллектор
            let actuatorInBranch = null;
            let actualFlowToActuatorM3s = 0;
            let drainFlowFromActuatorM3s = 0;

            if (pbr.cylinderCalculatedParams && pbr.cylinderCalculatedParams.actualFlowToCylinderM3s) {
                actuatorInBranch = modules.find(m => String(m.instanceId) === String(pbr.cylinderCalculatedParams.cylinderInstanceId));
                actualFlowToActuatorM3s = parseFloat(pbr.cylinderCalculatedParams.actualFlowToCylinderM3s);
                if (actuatorInBranch) {
                    const cylProps = actuatorInBranch.properties || {};
                    const D_piston = cylProps.pistonDiameter;
                    const d_rod = cylProps.rodDiameter;
                    drainFlowFromActuatorM3s = actualFlowToActuatorM3s; 
                    if (D_piston && D_piston > 0) {
                        const pistonArea = Math.PI * Math.pow(D_piston / 2, 2);
                        const rodArea = (d_rod && d_rod > 0) ? Math.PI * Math.pow(d_rod / 2, 2) : 0;
                        if (pistonArea > rodArea && pistonArea > 1e-9) {
                            drainFlowFromActuatorM3s = actualFlowToActuatorM3s * (pistonArea - rodArea) / pistonArea;
                        }
                    }
                }
            } else if (pbr.motorCalculatedParams && pbr.motorCalculatedParams.actualFlowToMotorM3s) {
                actuatorInBranch = modules.find(m => String(m.instanceId) === String(pbr.motorCalculatedParams.motorInstanceId));
                actualFlowToActuatorM3s = parseFloat(pbr.motorCalculatedParams.actualFlowToMotorM3s);
                // Для мотора сливной поток обычно равен входному (за вычетом внешних утечек, которые volEff мотора учитывает)
                drainFlowFromActuatorM3s = actualFlowToActuatorM3s; 
            }

            if (actuatorInBranch) {
                let pathLeadsToThisCollector = false;
                let drainPathToCollector = findPathModules(String(actuatorInBranch.instanceId), collectorInstanceIdStr, connections, modules, new Set([String(actuatorInBranch.instanceId)]));
                
                if (drainPathToCollector && drainPathToCollector.some(m => String(m.instanceId) === collectorInstanceIdStr)) {
                    pathLeadsToThisCollector = true;
                } else { 
                     const directConnToCollector = connections.find(c =>
                        String(c.sourceId) === String(actuatorInBranch.instanceId) &&
                        String(c.targetId).startsWith(collectorInstanceIdStr + "_in")
                    );
                    if (directConnToCollector) pathLeadsToThisCollector = true;
                }
                if (pathLeadsToThisCollector) {
                    totalFlowIntoThisCollectorM3s += drainFlowFromActuatorM3s;
                }
            }
        });
        console.log(`  [КОЛЛЕКТОР ${collector.name}] Суммарный поток на входе: ${(totalFlowIntoThisCollectorM3s * 60000).toFixed(2)} л/мин.`);
        let pathFromCollectorToTank = findPathModules(collectorInstanceIdStr, String(tankModule.instanceId), connections, modules, new Set([String(collectorInstanceIdStr)])) || [];
        
        if (pathFromCollectorToTank.length === 1 && String(pathFromCollectorToTank[0].instanceId) === String(tankModule.instanceId)) {
            // Direct connection
        }

        if (totalFlowIntoThisCollectorM3s > 1e-9 && 
            (pathFromCollectorToTank.length > 0 || connections.some(c => String(c.sourceId) === collectorInstanceIdStr && String(c.targetId).split('_')[0] === String(tankModule.instanceId)))) {
            
            let pathToCalcForCollectorDrain = pathFromCollectorToTank.filter(m => String(m.instanceId) !== collectorInstanceIdStr); 

            const commonDrainLineInfo = lineCalculations(
                `${pumpSystemType}_ОбщийСлив_от_${collector.name.replace(/[()\s]/g, '')}`,
                pathToCalcForCollectorDrain, totalFlowIntoThisCollectorM3s, 0, 
                fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
            );
            commonDrainPathsDetails[collectorInstanceIdStr] = commonDrainLineInfo.pipeDetails;
        }
    }
    systemSpecificResults.commonDrainPipesByCollector = commonDrainPathsDetails;
    console.log(`[ОТЛАДКА PROCESS_SINGLE_PUMP для ${pump.name}] Warnings:`, systemSpecificResults.schemaWarnings, "Problematic IDs:", systemSpecificResults.problematicModuleIds);
    return systemSpecificResults;
}

/**
 * Calculates all details for a single hydraulic branch.
 */
function calculateBranchDetails(
    branch, originalPumpFlowM3s, commonPathLossesPa, commonPathFromPump, 
    modules, connections, tankModule, fluid, 
    DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS, 
    pumpSystemType
) {
    const entryNodeForBranch = modules.find(m => String(m.instanceId) === String(branch.entryNodeInstanceId));
    const endConsumerNodeForThisBranch = modules.find(m => String(m.instanceId) === String(branch.actualEntryNodeForPathCalc.instanceId));

    if (!entryNodeForBranch || !endConsumerNodeForThisBranch) {
        console.warn(`[calculateBranchDetails] Пропуск ветки ${branch.branchName}: не найден входной или конечный узел.`);
        return { branchName: branch.branchName, error: "Missing entry/end node", isError: true };
    }
    
    const branchResult = {
        branchName: branch.branchName,
        velocities: {}, losses: { friction: {}, local: {}, components: {} }, efficiency: {},
        requiredBranchPressureMPa: 0, heatGeneratedKw: 0, 
        cylinderCalculatedParams: null, 
        motorCalculatedParams: null, // <--- НОВОЕ
        pressureLinePipeDetails: [], drainLinePipeDetails: [],
        isDeadEnd: branch.isDeadEnd, 
        isBrokenPath: branch.isBrokenPath,
        deadEndMessage: branch.deadEndMessage, 
        brokenPathMessage: branch.brokenPathMessage,
        actualEntryNodeForPathCalc: branch.actualEntryNodeForPathCalc,
        entryNodeInstanceId: branch.entryNodeInstanceId
    };

    if (branch.isDeadEnd || branch.isBrokenPath) {
        console.log(`  -- Ветка ${branch.branchName} является тупиковой/оборванной. Расчет не производится. --`);
        return branchResult;
    }
    console.log(`  -- Обработка ветки: ${branch.branchName} (Вход: ${entryNodeForBranch.name}, Конец: ${endConsumerNodeForThisBranch.name}, Поток: ${(branch.flowM3s * 60000).toFixed(2)} л/мин) --`);

    const branchCylinder = endConsumerNodeForThisBranch.type === 'cylinder' ? endConsumerNodeForThisBranch : null;
    const branchMotor = endConsumerNodeForThisBranch.type === 'motor' ? endConsumerNodeForThisBranch : null; // <--- НОВОЕ
    const isBypassToTank = String(endConsumerNodeForThisBranch.instanceId) === String(tankModule.instanceId) && !branchCylinder && !branchMotor; // <--- ИЗМЕНЕНО

    let pathStrictlyWithinBranch = [];
    // ... (логика pathStrictlyWithinBranch остается прежней) ...
    if (String(entryNodeForBranch.instanceId) === String(endConsumerNodeForThisBranch.instanceId) && entryNodeForBranch.type !== 'splitter' && entryNodeForBranch.type !== 'collector' ) {
        pathStrictlyWithinBranch = [entryNodeForBranch];
    } else {
        let pathModulesFound = findPathModules(
            String(entryNodeForBranch.instanceId), String(endConsumerNodeForThisBranch.instanceId),
            connections, modules, new Set(), branch.entrySplitterPortId
        ) || [];
        
        let tempPath = [];
        if(String(entryNodeForBranch.instanceId) !== String(endConsumerNodeForThisBranch.instanceId) && 
           entryNodeForBranch.type !== 'splitter' && 
           !pathModulesFound.find(m => String(m.instanceId) === String(entryNodeForBranch.instanceId))) {
            tempPath.push(entryNodeForBranch);
        }
        tempPath.push(...pathModulesFound);
        
        const endIndex = tempPath.findIndex(m => String(m.instanceId) === String(endConsumerNodeForThisBranch.instanceId));
        if (endIndex !== -1) {
            pathStrictlyWithinBranch = tempPath.slice(0, endIndex + 1);
        } else if (tempPath.length > 0 && String(tempPath[tempPath.length -1].instanceId) === String(endConsumerNodeForThisBranch.instanceId)) {
             pathStrictlyWithinBranch = tempPath;
        } else if (String(entryNodeForBranch.instanceId) === String(endConsumerNodeForThisBranch.instanceId)) {
            pathStrictlyWithinBranch = [entryNodeForBranch];
        } else {
            pathStrictlyWithinBranch = tempPath; 
            console.warn(`[calculateBranchDetails] Путь внутри ветки для ${branch.branchName} мог быть определен не полностью до ${endConsumerNodeForThisBranch.name}`);
        }
        
        pathStrictlyWithinBranch = pathStrictlyWithinBranch.filter(Boolean).reduce((acc, m) => {
            if (m && !acc.find(x => String(x.instanceId) === String(m.instanceId))) acc.push(m);
            return acc;
        }, []);
    }


    const pressureLineCalc = lineCalculations(
        `${branch.branchName}_НапорнаяЧистоВетки`, pathStrictlyWithinBranch, branch.flowM3s, 0,
        fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
    );
    branchResult.pressureLinePipeDetails = pressureLineCalc.pipeDetails;
    let pipeAndLocalLossesInPureBranchPa = pressureLineCalc.totalFrictionLossPa + pressureLineCalc.totalLocalLossPa;
    
    let componentLossPressureInPureBranchPa = 0;
    const pressurePathInBranchCompInstanceIds = pathStrictlyWithinBranch.map(m => String(m.instanceId));
    pathStrictlyWithinBranch.filter(m => m.type !== 'pipe').forEach(comp => {
        const compProps = comp.properties || {};
        const nomLossMPa = compProps.pressureDrop || 0;
        const nomFlowLmin = compProps.nominalFlowLmin || 0;
        let flowForComp = branch.flowM3s; 
        
        if (comp.type === 'splitter' && 
            String(comp.instanceId) === String(entryNodeForBranch.instanceId) &&
            branch.initialComponentsOnPressurePath.find(ic => String(ic.instanceId) === String(comp.instanceId))) {
             flowForComp = originalPumpFlowM3s; 
        }

        if (nomLossMPa > 0 && nomFlowLmin > 0) {
            const nomFlowM3s = nomFlowLmin / 60000;
            if (nomFlowM3s > 0) componentLossPressureInPureBranchPa += nomLossMPa * 1e6 * Math.pow(flowForComp / nomFlowM3s, 2);
            else componentLossPressureInPureBranchPa += nomLossMPa * 1e6;
        } else if (nomLossMPa > 0) {
            componentLossPressureInPureBranchPa += nomLossMPa * 1e6;
        }
    });
    branchResult.losses.friction.pressurePa = parseFloat(pressureLineCalc.totalFrictionLossPa.toFixed(0));
    branchResult.losses.local.pressurePa = parseFloat(pressureLineCalc.totalLocalLossPa.toFixed(0));
    branchResult.losses.components.pressurePa = parseFloat(componentLossPressureInPureBranchPa.toFixed(0));
    const totalPressureLossInsideBranchPa = pipeAndLocalLossesInPureBranchPa + componentLossPressureInPureBranchPa;

    let drainFlowForBranchM3s = branch.flowM3s; // По умолчанию для мотора или байпаса
    let drainLineCalc = { totalFrictionLossPa: 0, totalLocalLossPa: 0, pipeDetails: [] };
    let componentLossDrainPa = 0;
    let fullDrainPathForBranch = [];
    let drainPathInBranchCompInstanceIds = [];

    const actuatorForDrainCalc = branchCylinder || branchMotor; // <--- НОВОЕ: общий исполнительный механизм для слива

    if (actuatorForDrainCalc) { // <--- ИЗМЕНЕНО: общий блок для цилиндра и мотора
        if (branchCylinder) {
            const cylProps = branchCylinder.properties || {};
            const D_piston = cylProps.pistonDiameter;
            const d_rod = cylProps.rodDiameter;
            if (D_piston && D_piston > 0) {
                const pistonArea = Math.PI * Math.pow(D_piston / 2, 2);
                const rodArea = (d_rod && d_rod > 0) ? Math.PI * Math.pow(d_rod / 2, 2) : 0;
                if (pistonArea > rodArea && pistonArea > 1e-9) {
                    drainFlowForBranchM3s = branch.flowM3s * (pistonArea - rodArea) / pistonArea;
                }
            }
        }
        // Для мотора drainFlowForBranchM3s остается branch.flowM3s (уже установлено по умолчанию)

        fullDrainPathForBranch = findPathModules(String(actuatorForDrainCalc.instanceId), String(tankModule.instanceId), connections, modules, new Set([String(actuatorForDrainCalc.instanceId)])) || [];
        
        drainPathInBranchCompInstanceIds = fullDrainPathForBranch.map(m => String(m.instanceId));
        drainLineCalc = lineCalculations(
            `${branch.branchName}_Сливная`, 
            fullDrainPathForBranch.filter(m => String(m.instanceId) !== String(actuatorForDrainCalc.instanceId)), 
            drainFlowForBranchM3s, 0,
            fluid, DEFAULT_PIPE_DIAMETER, DEFAULT_PIPE_LENGTH, DEFAULT_PIPE_ROUGHNESS
        );
        branchResult.drainLinePipeDetails = drainLineCalc.pipeDetails;
        fullDrainPathForBranch.filter(m => m.type !== 'pipe' && String(m.instanceId) !== String(actuatorForDrainCalc.instanceId)).forEach(comp => {
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
    branchResult.losses.friction.drainPa = parseFloat(drainLineCalc.totalFrictionLossPa.toFixed(0));
    branchResult.losses.local.drainPa = parseFloat(drainLineCalc.totalLocalLossPa.toFixed(0));
    branchResult.losses.components.drainPa = parseFloat(componentLossDrainPa.toFixed(0));
    const totalDrainLineLossPa = drainLineCalc.totalFrictionLossPa + drainLineCalc.totalLocalLossPa + componentLossDrainPa;

    branchResult.losses.totalPressureLineLossMPa = parseFloat((totalPressureLossInsideBranchPa / 1e6).toFixed(4));
    branchResult.losses.totalDrainLineLossMPa = parseFloat((totalDrainLineLossPa / 1e6).toFixed(4));

    let requiredPressureAtBranchEntryPa = 0;
    if (branchCylinder) {
        const cylinderWorkingPressurePa = calculateCylinderPressure(branchCylinder, totalDrainLineLossPa);
        requiredPressureAtBranchEntryPa = cylinderWorkingPressurePa + totalPressureLossInsideBranchPa;
        // Расчет параметров цилиндра (остается здесь)
        const cylProps = branchCylinder.properties || {};
        const volEffForThisBranchPressureLine = calculateOverallVolumetricEfficiency(
            pathStrictlyWithinBranch.filter(m => String(m.instanceId) !== String(branchCylinder.instanceId)),
            branch.flowM3s, 0, false,
            pathStrictlyWithinBranch.filter(m => String(m.instanceId) !== String(branchCylinder.instanceId)).map(m=>String(m.instanceId)),
            []
        );
        const actualFlowToCylinderM3s = branch.flowM3s * volEffForThisBranchPressureLine * (cylProps.volEff || 1.0);
        let rodSpeedMs = 0, usefulPowerKw = 0;
        if ((cylProps.pistonDiameter || 0) > 0) {
            const pistonAreaM2 = Math.PI * Math.pow(cylProps.pistonDiameter / 2, 2);
            if (pistonAreaM2 > 1e-9) rodSpeedMs = actualFlowToCylinderM3s / pistonAreaM2;

            // Полезная мощность гидродвигателя возвратно-поступательного действия (гидроцилиндра)
            // force - усилие на штоке в Н (из свойств модуля), rodSpeedMs - скорость движения штока в м/с. Деление на 1000 переводит Вт в кВт
            usefulPowerKw = (cylProps.force || 0) * rodSpeedMs / 1000;
        }
        branchResult.cylinderCalculatedParams = {
            pistonChamberPressureMPa: parseFloat((cylinderWorkingPressurePa / 1e6).toFixed(3)),
            rodChamberPressureMPa: parseFloat((totalDrainLineLossPa / 1e6).toFixed(3)),
            rodSpeedMs: parseFloat(rodSpeedMs.toFixed(4)),
            usefulPowerKw: parseFloat(usefulPowerKw.toFixed(3)),
            actualFlowToCylinderM3s: parseFloat(actualFlowToCylinderM3s.toExponential(3)),
            cylinderInstanceId: branchCylinder.instanceId
        };
        branchResult.hydraulicUsefulPowerAtCylinderPaM3s = (cylinderWorkingPressurePa - totalDrainLineLossPa) * actualFlowToCylinderM3s;

    } else if (branchMotor) { // <--- НОВЫЙ БЛОК
        const motorWorkingPressureDropPa = calculateMotorPressureDrop(branchMotor);
        const pressureAtMotorInletPa = motorWorkingPressureDropPa + totalDrainLineLossPa;
        requiredPressureAtBranchEntryPa = pressureAtMotorInletPa + totalPressureLossInsideBranchPa;
        // Расчет параметров мотора
        const motorProps = branchMotor.properties || {};
        const volEffForThisBranchPressureLine = calculateOverallVolumetricEfficiency(
            pathStrictlyWithinBranch.filter(m => String(m.instanceId) !== String(branchMotor.instanceId)),
            branch.flowM3s, 0, false, 
            pathStrictlyWithinBranch.filter(m => String(m.instanceId) !== String(branchMotor.instanceId)).map(m => String(m.instanceId)),
            []
        );
        const actualFlowToMotorM3s = branch.flowM3s * volEffForThisBranchPressureLine * (motorProps.volEff || 1.0);
        let motorRpm = 0;
        const motorWorkingVolumeM3 = (motorProps.workingVolume || 0) * 1e-6;
        if (motorWorkingVolumeM3 > 0) {
            const motorRps = actualFlowToMotorM3s / motorWorkingVolumeM3;
            motorRpm = motorRps * 60;
        }
        // omegaRadS в рад/с
        // 2 * pi * частота вращения вала гидромотора
        const omegaRadS = (motorRpm / 60) * 2 * Math.PI;
        // Полезная мощность гидродвигателя вращательного действия (гидромотора)
        // крутящий момент на валу гидромотора в Нм * omegaRadS
        // Деление на 1000 переводит Вт в кВт
        const usefulPowerKw = (motorProps.requiredTorque || 0) * omegaRadS / 1000;

        branchResult.motorCalculatedParams = { // <--- НОВОЕ: Сохраняем параметры мотора
            pressureDropMPa: parseFloat((motorWorkingPressureDropPa / 1e6).toFixed(3)),
            rpm: parseFloat(motorRpm.toFixed(1)),
            usefulPowerKw: parseFloat(usefulPowerKw.toFixed(3)),
            actualFlowToMotorM3s: parseFloat(actualFlowToMotorM3s.toExponential(3)),
            motorInstanceId: branchMotor.instanceId
        };
        branchResult.hydraulicUsefulPowerAtMotorPaM3s = motorWorkingPressureDropPa * actualFlowToMotorM3s;


    } else if (isBypassToTank) {
        requiredPressureAtBranchEntryPa = totalPressureLossInsideBranchPa;
    }
    branchResult.requiredBranchPressureMPa = parseFloat((requiredPressureAtBranchEntryPa / 1e6).toFixed(3));
    branchResult.pressureAtPumpOutletForThisBranchTotal = requiredPressureAtBranchEntryPa + commonPathLossesPa;
    
    // <--- ИЗМЕНЕНО: Учитываем мотор при расчете КПД ветки
    const modulesForBranchEffCalc = [...pathStrictlyWithinBranch, ...(actuatorForDrainCalc ? fullDrainPathForBranch : [])]
        .filter(Boolean).reduce((acc, m) => { if (m && !acc.find(x => String(x.instanceId) === String(m.instanceId))) acc.push(m); return acc; }, []);
    
    const totalLossesForBranchHydEff = totalPressureLossInsideBranchPa + (actuatorForDrainCalc || isBypassToTank ? totalDrainLineLossPa : 0);
    branchResult.efficiency.hydraulic = parseFloat(calculateHydraulicEfficiency(requiredPressureAtBranchEntryPa, totalLossesForBranchHydEff).toFixed(3));
    branchResult.efficiency.mechanical = parseFloat(calculateOverallMechanicalEfficiency(modulesForBranchEffCalc).toFixed(3)); // calculateOverallMechanicalEfficiency уже должен учитывать мотор
    branchResult.efficiency.volumetric = parseFloat(calculateOverallVolumetricEfficiency(
        modulesForBranchEffCalc, branch.flowM3s, drainFlowForBranchM3s, !!actuatorForDrainCalc,
        pressurePathInBranchCompInstanceIds, 
        drainPathInBranchCompInstanceIds 
    ).toFixed(3)); // calculateOverallVolumetricEfficiency уже должен учитывать мотор
    branchResult.efficiency.total = parseFloat(Math.max(0, (branchResult.efficiency.hydraulic * branchResult.efficiency.mechanical * branchResult.efficiency.volumetric))).toFixed(4);

    return branchResult;
}

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});