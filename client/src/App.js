
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

    const getDefaultProperties = (item) => {
        let defaultProps = {
          color: '#9e9e9e' // Общий серый цвет по умолчанию
        };
    
        switch (item.id) {
case 'distributor_rge100':
         defaultProps = {
          ...defaultProps,
          pressureDrop: 1.5,     // МПа, номинальный перепад
          internalLeakage: 0.02, // л/мин
          sideSurfaceArea: 0.32, // м²
          nominalFlowLmin: 100,  // л/мин, ПРИМЕР! Нужно найти реальное значение для RGE100
          color: '#ff9800',
        };
        break;
      case 'power_block_bpg': // Блок питания
         defaultProps = {
          ...defaultProps,
          pressureDrop: 0.35,    // МПа
          internalLeakage: 0.1,  // л/мин
          sideSurfaceArea: 0.085, // м²
          nominalFlowLmin: 50,   // л/мин, ПРИМЕР!
          color: '#9c27b0',
        };
        break;
      case 'hydro_block_gbf': // Гидроблок
         defaultProps = {
          ...defaultProps,
          pressureDrop: 0.3,     // МПа
          internalLeakage: 0.015, // л/мин
          sideSurfaceArea: 0.063, // м²
          nominalFlowLmin: 40,    // л/мин, ПРИМЕР!
          color: '#e91e63',
        };
        break;
      case 'filter_frc12':
         defaultProps = {
          ...defaultProps,
          pressureDrop: 0.1,     // МПа, номинальный перепад при ном. расходе чистого фильтра
          sideSurfaceArea: 0.198, // м²
          filtrationRate: 30,    // мкм
          nominalFlowLmin: 60,   // л/мин, ПРИМЕР! Нужно найти реальное значение для FRC12
          color: '#ffeb3b',
        };
        break;
      case 'pipe':
        defaultProps = { /* ... как было ... */ };
        break;
    }
    return defaultProps;
  };
 

    const handleDrop = useCallback((item, offset) => {
      if (item.instanceId) {
          updateModulePosition(item.instanceId, offset);
      }
      else if (item.type) { 

        const defaultProps = getDefaultProperties(item);

        const newInstance = {
            id: item.id,
            name: item.name,
            type: item.type, // Сохраняем тип для PropertiesScreen
            system: item.system, // Сохраняем систему, если есть
            instanceId: Date.now(), // Уникальный ID экземпляра
            properties: defaultProps, // Используем новые дефолтные свойства
            position: { x: offset.x, y: offset.y }
        };

          setMainScreenModules((prev) => [...prev, newInstance]);
          setValidationResult(''); 
        }
    }, [mainScreenModules]);

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
      setProcessingResult('');
    }, [selectedModule]);

    const updateModulePosition = useCallback((instanceId, newPosition) => {
        setMainScreenModules(prevModules =>
          prevModules.map(module => {
            if (module.instanceId === instanceId) {
              // Важно: обновляем только позицию, сохраняя остальные данные
              return { ...module, position: newPosition };
            }
            return module;
          })
        );
        // Обновляем позицию и в selectedModule, если он выбран и перемещается
        if(selectedModule && selectedModule.instanceId === instanceId) {
             setSelectedModule(prevSelected => ({...prevSelected, position: newPosition }));
        }
      }, [selectedModule]); 
    
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
      setProcessingResult('');
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
        // Payload для нового API
        const payload = {
            modules: mainScreenModules,
            connections: connections,
            // Можно добавить глобальные параметры сюда, если нужно
            // systemParams: { ambientTemp: 30, heatTransferCoeff: 15 }
        };
        console.log("Payload to send for calculation:", JSON.stringify(payload, null, 2));
    
        // Вызов НОВОГО API
        setIsLoading(true);
        setProcessingResult('Calculating...'); // Показываем статус
        try {
          const response = await fetch(`${API_BASE_URL}/calculate-hydraulics`, { // Имя нового эндпоинта
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
          });
          const data = await response.json(); // Получаем результат от бэкенда
          if (!response.ok) {
              throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }
          // Отображаем основной результат и заключение
          const resultString = `Result: Temp = ${data.calculatedSteadyStateTempC}°C. ${data.conclusion}`;
          setProcessingResult(resultString);
          alert(resultString); // Показываем пользователю
    
          // Можно вывести детали в консоль
          console.log("Calculation Details:", data.details);
    
        } catch (error) {
            console.error("Error processing hydraulics:", error);
            const errorMsg = `Error: ${error.message}`;
            setProcessingResult(errorMsg);
            alert(errorMsg);
        } finally {
            setIsLoading(false);
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