
import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Catalog from './components/Catalog';
import MainScreen from './components/MainScreen';
import PropertiesScreen from './components/PropertiesScreen';
import LoadSchemeModal from './components/LoadSchemeModal';
import './styles/App.css';

const API_BASE_URL = 'http://localhost:5001/api';

function App() {
    const [selectedModule, setSelectedModule] = useState(null);
    const [mainScreenModules, setMainScreenModules] = useState([]);
    const [connections, setConnections] = useState([]);
    const [validationResult, setValidationResult] = useState(''); 
    const [processingResult, setProcessingResult] = useState(''); 
    // --- для сохранения/загрузки ---
    const [savedSchemes, setSavedSchemes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

    const hasModuleOfType = (type) => {
      return mainScreenModules.some(m => m.type === type);
    };

    const handleDrop = (item, offset) => {
      if (item.instanceId) {
          updateModulePosition(item.instanceId, offset);
      }
      else if (item.type) { 

            let defaultProps = {
                color: 'blue'
            };

          if ((item.type === 'start' && hasModuleOfType('start')) ||
              (item.type === 'end' && hasModuleOfType('end'))) {
              alert(`You can only place one "${item.name}" module`);
              return; 
          }

          if (item.type === 'start') {
            defaultProps.color = 'green';
            defaultProps.startValue = 0;
            } else if (item.type === 'end') {
                defaultProps.color = 'red';
            } else if (item.id === 1) {
                defaultProps.valueToAdd = 1;
            } else if (item.id === 2) {
                defaultProps.factor = 2;
            } else if (item.id === 3) { 
            }

          const newInstance = {
              id: item.id,
              name: item.name,
              type: item.type,
              instanceId: Date.now(),
              properties: defaultProps,
              position: { x: offset.x, y: offset.y }
          };
          setMainScreenModules((prev) => [...prev, newInstance]);
          setValidationResult(''); 
        }
    };

    const handleModuleClick = (module) => { 
      setSelectedModule(module);
    };

    const handleDeleteModule = useCallback((instanceIdToDelete) => {
        setMainScreenModules(prevModules =>
            prevModules.filter(module => module.instanceId !== instanceIdToDelete)
        );

        setConnections(prevConnections =>
            prevConnections.filter(conn =>
                conn.sourceId !== instanceIdToDelete && conn.targetId !== instanceIdToDelete
            )
        );

        if (selectedModule && selectedModule.instanceId === instanceIdToDelete) {
            setSelectedModule(null);
        }

        setValidationResult('');
        setProcessingResult('');

    }, [selectedModule]); 

    const updateModuleProperties = useCallback((instanceId, newProperties) => {
      setMainScreenModules(
        mainScreenModules.map(m =>
              m.instanceId === instanceId ? { ...m, properties: newProperties } : m
          )
      );
      if(selectedModule && selectedModule.instanceId === instanceId) {
          setSelectedModule({...selectedModule, properties: newProperties });
      }
      setValidationResult('');
    }, [selectedModule]);

    const updateModulePosition = (instanceId, newPosition) => {
      setMainScreenModules(prevModules =>
        prevModules.map(module => {
          if (module.instanceId === instanceId) {
            return { ...module, position: newPosition };
          }
          return module;
        })
      );
    };

    const handleAddConnection = useCallback((sourceId, targetId) => {
      if (sourceId === targetId) {
          console.warn("Cannot connect module to itself");
          return;
      }

      const sourceModule = mainScreenModules.find(m => m.instanceId === sourceId);
      const targetModule = mainScreenModules.find(m => m.instanceId === targetId);
      if (targetModule?.type === 'start') {
            alert("Cannot connect TO a Start node.");
            return;
      }
        if (sourceModule?.type === 'end') {
            alert("Cannot connect FROM an End node.");
            return;
        }

      const connectionExists = connections.some(
          conn => (conn.sourceId === sourceId && conn.targetId === targetId) ||
                  (conn.sourceId === targetId && conn.targetId === sourceId)
      );

      if (connectionExists) {
          console.warn("Connection already exists");
          return;
      }

      const isSourcePortBusy = connections.some(conn => conn.sourceId === sourceId);
      const isTargetPortBusy = connections.some(conn => conn.targetId === targetId);
  
      if (isSourcePortBusy) {
          alert(`Output port of "${sourceModule?.name || 'Source'}" is already connected.`);
          return;
      }
      if (isTargetPortBusy) {
           alert(`Input port of "${targetModule?.name || 'Target'}" is already connected.`);
           return;
      }
  
      const newConnection = {
          id: `conn-${Date.now()}`, 
          sourceId: sourceId,
          targetId: targetId,
      };
      setConnections(prevConnections => [...prevConnections, newConnection]);
      setValidationResult('');
  }, [connections, mainScreenModules]); 

      // --- Функция Поиска Цепочки (DFS) ---
      const findChainPath = useCallback(() => {
        const startNode = mainScreenModules.find(m => m.type === 'start');
        const endNode = mainScreenModules.find(m => m.type === 'end');

        if (!startNode) return { error: "Error: 'Start Node' not found on the screen." };
        if (!endNode) return { error: "Error: 'End Node' not found on the screen." };

        const path = [startNode]; // Начинаем путь со стартового узла
        const visited = new Set([startNode.instanceId]); // Множество посещенных ID

        // Создаем карту смежности для быстрого поиска следующих узлов
        const adj = new Map();
        connections.forEach(conn => {
            if (!adj.has(conn.sourceId)) {
                adj.set(conn.sourceId, []);
            }
            adj.get(conn.sourceId).push(conn.targetId);
        });

        function dfs(currentNodeId) {
            if (currentNodeId === endNode.instanceId) {
                return path; // Достигли конца, возвращаем путь
            }

            const neighbors = adj.get(currentNodeId) || []; // Получаем ID следующих узлов

            for (const neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    const neighborNode = mainScreenModules.find(m => m.instanceId === neighborId);
                    if (neighborNode) { // Убедимся, что узел существует
                       path.push(neighborNode); // Добавляем в путь
                       const result = dfs(neighborId); // Рекурсивный вызов
                       if (result) return result; // Если путь найден, возвращаем его вверх
                       path.pop(); // Backtrack: убираем из пути, если ветка не привела к цели
                    }
                    // Не убираем из visited, т.к. ищем один любой путь
                }
            }
            return null; // Путь из этого узла не найден
        }

        const finalPath = dfs(startNode.instanceId);

        if (finalPath) {
            // Возвращаем массив имен или объектов
            return { chain: finalPath.map(node => node.name) }; // Или return { chain: finalPath };
        } else {
            return { error: "Error: No valid chain found from Start to End." };
        }

    }, [mainScreenModules, connections]); // Зависит от модулей и связей

    const handleProcessChain = async () => {
        const result = findChainPath();
            if (result && result.chain) {
                alert("Цепочка: " + result.chain.join(" -> "));

            const modulesToSend = mainScreenModules.map(m => {
                let opKey = null;
                if (m.type === 'start') opKey = 'GET_START_VALUE';
                else if (m.type === 'end') opKey = 'GET_END_VALUE';
                else if (m.id === 1) opKey = 'ADD_NUMBER';
                else if (m.id === 2) opKey = 'MULTIPLY_BY';
                else if (m.id === 3) opKey = 'SQUARE'; 

                return {
                    instanceId: m.instanceId,
                    type: m.type,
                    name: m.name, 
                    operationKey: opKey, 
                    properties: m.properties 
                };
            });

            const payload = {
                modules: modulesToSend,
                connections: connections,
            };

            try {
                const response = await fetch(`${API_BASE_URL}/process-chain`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                const data = await response.json();
                const currentResultString = `Result: ${data.result}`; 
                setProcessingResult(currentResultString);

                if (!response.ok) {
                    throw new Error(data.error || `HTTP error! status: ${response.status}`);
                }

                alert(currentResultString)

            } catch (error) {
                console.error("Error processing chain:", error);
                setProcessingResult(`Error: ${error.message}`);
            }
        }
    };

    const handleRemoveConnection = useCallback((connectionIdToRemove) => {
        setConnections(prevConnections =>
            prevConnections.filter(conn => conn.id !== connectionIdToRemove)
        );
        setProcessingResult(''); 
    }, []); 


    const fetchSavedSchemes = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/schemes`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setSavedSchemes(data || []);
        } catch (error) {
            console.error("Error fetching saved schemes:", error);
            alert(`Error fetching schemes: ${error.message}`);
            setSavedSchemes([]); 
        } finally {
            setIsLoading(false);
        }
    }, []); 
    
    useEffect(() => {
        fetchSavedSchemes();
    }, [fetchSavedSchemes]); // Запускаем при монтировании и если fetchSavedSchemes изменится

    const handleSaveScheme = async () => {
        const schemeName = prompt("Enter a name for your scheme:");
        if (!schemeName) {
            return;
        }

        setIsLoading(true);
        const payload = {
            name: schemeName,
            data: {
                modules: mainScreenModules,
                connections: connections,
            }
        };

        try {
            const response = await fetch(`${API_BASE_URL}/schemes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const savedScheme = await response.json();
            alert(`Scheme "${savedScheme.name}" saved successfully!`);
            fetchSavedSchemes(); 

        } catch (error) {
            console.error("Error saving scheme:", error);
            alert(`Error saving scheme: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoadScheme = async (schemeId) => {
        if (!schemeId) return;

        setIsLoading(true);
        setIsLoadModalOpen(false);

        try {
            const response = await fetch(`${API_BASE_URL}/schemes/${schemeId}`);
            if (!response.ok) {
                 if (response.status === 404) {
                     throw new Error("Scheme not found.");
                 }
                 const errorData = await response.json();
                 throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const scheme = await response.json();

            // Обновляем состояние приложения данными загруженной схемы
            setMainScreenModules(scheme.data.modules || []);
            setConnections(scheme.data.connections || []);
            setSelectedModule(null); 
            setValidationResult('');
            setProcessingResult('');

            alert(`Scheme "${scheme.name}" loaded successfully!`);

        } catch (error) {
            console.error("Error loading scheme:", error);
            alert(`Error loading scheme: ${error.message}`);
            // setMainScreenModules([]);
            // setConnections([]);
        } finally {
            setIsLoading(false);
        }
    };

    const openLoadModal = () => {
        fetchSavedSchemes();
        setIsLoadModalOpen(true);
    };

     const closeLoadModal = () => {
        setIsLoadModalOpen(false);
    };


    return (
        <DndProvider backend={HTML5Backend}>
            <div className="app">
                <div className="left-panel">
                    <div className="controls-section top-controls"> 
                        <h3>Actions</h3>
                        <button onClick={handleSaveScheme} disabled={isLoading}>
                            {isLoading ? 'Saving...' : 'Save Scheme'}
                        </button>
                        <button onClick={openLoadModal} disabled={isLoading}>
                            {isLoading ? 'Loading...' : 'Load Scheme'}
                        </button>
                        <button onClick={handleProcessChain} disabled={isLoading}>
                            Validate/Process
                        </button>
                        {isLoading && <span> Loading...</span>}
                        {validationResult && <p className="validation-result">{validationResult}</p>}
                        {processingResult && <p className="processing-result">{processingResult}</p>}
                    </div>
                    <Catalog />
                </div>
                <MainScreen
                    modules={mainScreenModules}
                    connections={connections}
                    onDrop={handleDrop}
                    onModuleClick={handleModuleClick}
                    updateModulePosition={updateModulePosition}
                    onAddConnection={handleAddConnection}
                    onRemoveConnection={handleRemoveConnection}
                />
                <PropertiesScreen
                   selectedModule={selectedModule}
                   updateModuleProperties={updateModuleProperties}
                   onDeleteModule={handleDeleteModule}
                />
                <LoadSchemeModal
                    isOpen={isLoadModalOpen}
                    onClose={closeLoadModal}
                    schemes={savedSchemes}
                    onLoad={handleLoadScheme}
                    isLoading={isLoading}
                />
            </div>
        </DndProvider>
    );

}

export default App;