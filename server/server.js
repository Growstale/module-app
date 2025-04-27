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