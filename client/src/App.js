import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Catalog from './components/Catalog';
import MainScreen from './components/MainScreen';
import PropertiesScreen from './components/PropertiesScreen';
import LoadSchemeModal from './components/LoadSchemeModal';
import ResultsDisplay from './components/ResultsDisplay';
import './styles/App.css';

function App() {
    const [selectedModule, setSelectedModule] = useState(null);
    const [mainScreenModules, setMainScreenModules] = useState([]);
    const [connections, setConnections] = useState([]);
    // Строка для отображения краткого результата гидравлического расчета
    const [processingResult, setProcessingResult] = useState('');
    // Массив сохраненных схем, загруженных с сервера
    const [savedSchemes, setSavedSchemes] = useState([]);
    // Булевый флаг, указывающий, происходит ли в данный момент какая-либо загрузка данных с сервера
    const [isLoading, setIsLoading] = useState(false);
    // Булевый флаг, управляющий видимостью модального окна LoadSchemeModal
    const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
    // Объект, хранящий детализированные результаты расчетов, полученные от сервера
    const [detailedResults, setDetailedResults] = useState(null);
    // Хранит полный ответ от сервера после выполнения расчета
    const [calculationResponse, setCalculationResponse] = useState(null);
    // Булевый флаг, управляющий видимостью панели с детализированными результатами
    const [isResultsPanelOpen, setIsResultsPanelOpen] = useState(false);
    // Объект, хранящий сообщения об ошибках и предупреждениях, выявленных при клиентской валидации схемы
    const [validationMessages, setValidationMessages] = useState({ errors: [], warnings: [] });
    // Массив ID модулей, которые были помечены сервером как проблемные по результатам расчета
    const [problematicModules, setProblematicModules] = useState([]);

    // Массив объектов, определяющих доступные для выбора рабочие жидкости и их свойства
    const fluidOptions = [
        { key: "HLP32", name: "HLP 32 (стандарт)", density: 868, kinematicViscosityM2s: 33.2e-6, default: true },
        { key: "MGE46A", name: "МГЕ-46А", density: 875, kinematicViscosityM2s: 46e-6 }, 
        { key: "VMGZ", name: "ВМГЗ", density: 860, kinematicViscosityM2s: 10e-6 }   
    ];

    // Строка, хранящая ключ (идентификатор) текущей выбранной рабочей жидкости
    const [selectedFluidKey, setSelectedFluidKey] = useState(
        fluidOptions.find(f => f.default)?.key || fluidOptions[0].key
    );

    const clearAllDynamicStates = () => {
        setValidationMessages({ errors: [], warnings: [] });
        setProblematicModules([]);
        setProcessingResult('');
        setCalculationResponse(null);
        setDetailedResults(null);
    };

    // Обработчик изменения жидкости
    const handleFluidChange = (event) => {
        setSelectedFluidKey(event.target.value);
        clearAllDynamicStates(); 
    };

    // Вызывается, когда пользователь кликает на свободное место на MainScreen или на модуле, чтобы убрать фокус с текущего выделенного модуля
    const deselectModule = useCallback(() => {
    if (selectedModule !== null) { 
        setSelectedModule(null);
    }
    }, [selectedModule]);

    // Переключает состояние isResultsPanelOpen, показывая или скрывая панель детализированных результатов
    const toggleResultsPanel = () => {
        setIsResultsPanelOpen(prev => !prev);
    };

    // Обновляет позицию модуля с заданным instanceId в массиве mainScreenModules
    const updateModulePosition = useCallback((instanceId, newPosition) => {
        clearAllDynamicStates();
        setMainScreenModules(prevModules =>
            prevModules.map(module =>
                module.instanceId === instanceId ? { ...module, position: newPosition } : module
            )
        );
        if (selectedModule && selectedModule.instanceId === instanceId) {
            setSelectedModule(prevSelected => ({ ...prevSelected, position: newPosition }));
        }
    }, [selectedModule]);

    // Возвращает объект со свойствами по умолчанию для нового модуля, добавляемого на MainScreen
    const getDefaultProperties = (item) => {
        let defaultProps = { color: '#9e9e9e' };
        switch (item.id) {
            case 'engine_d245': defaultProps = { ...defaultProps, idleRpm: 750, nominalRpm: 2200, maxTorqueRpm: 1600, selectedRpmMode: 'nominalRpm', color: '#f44336' }; break;
            case 'tank': defaultProps = { ...defaultProps, length: 0.695, width: 0.36, height: 0.445, color: '#e0e0e0' }; break;
            case 'pump_gns_ap30': defaultProps = { ...defaultProps, workingVolume: 43, volumetricEff: 0.92, driveRatio: 0.866, mechEff: 0.85, sideSurfaceArea: 0.0776, nominalPressureMPa: 16, color: '#4caf50' }; break;
            case 'pump_gru_nsh10': defaultProps = { ...defaultProps, workingVolume: 10, volumetricEff: 0.92, driveRatio: 1, mechEff: 0.85, sideSurfaceArea: 0.0412, nominalPressureMPa: 16, color: '#2196f3' }; break;
            case 'cylinder_znu_c63': defaultProps = { ...defaultProps, pistonDiameter: 0.063, rodDiameter: 0.04, stroke: 0.2, force: 39923.4, mechEff: 0.95, volEff: 0.99, sideSurfaceArea: 0.086, color: '#8bc34a' }; break;
            case 'cylinder_gru_c70': defaultProps = { ...defaultProps, pistonDiameter: 0.07, rodDiameter: 0.06, stroke: 0.007, force: 12246, mechEff: 0.98, volEff: 0.99, sideSurfaceArea: 0, color: '#03a9f4' }; break;
            case 'distributor_rge100': defaultProps = { ...defaultProps, pressureDrop: 1.5, internalLeakage: 0.02, sideSurfaceArea: 0.32, nominalFlowLmin: 100, color: '#ff9800' }; break;
            case 'power_block_bpg': defaultProps = { ...defaultProps, pressureDrop: 0.35, internalLeakage: 0.1, sideSurfaceArea: 0.085, nominalFlowLmin: 50, color: '#9c27b0' }; break;
            case 'hydro_block_gbf': defaultProps = { ...defaultProps, pressureDrop: 0.3, internalLeakage: 0.015, sideSurfaceArea: 0.063, nominalFlowLmin: 40, color: '#e91e63' }; break;
            case 'filter_frc12': defaultProps = { ...defaultProps, pressureDrop: 0.1, sideSurfaceArea: 0.198, filtrationRate: 30, nominalFlowLmin: 60, color: '#ffeb3b' }; break;
            case 'pipe': defaultProps = { ...defaultProps, diameter: 0.020, length: 1.0, roughness: 0.00005, localResistanceCoeff: 0, color: '#607d8b' }; break;
            case 'tee_splitter': defaultProps = { ...defaultProps, pressureDrop: 0.01, nominalFlowLmin: 200, color: '#757575' }; break;
            case 'collector': defaultProps = { ...defaultProps, pressureDrop: 0.01, nominalFlowLmin: 200, color: '#BDBDBD' }; break;
            case 'hydromotor_basic': defaultProps = {...defaultProps, workingVolume: 50, mechEff: 0.9, volEff: 0.95, nominalPressureMPa: 16, nominalRpm: 1500, maxRpm: 3000, torqueAtNominalPressure: 100, requiredTorque: 80, sideSurfaceArea: 0.05, color: '#ffc107' }; break;
            default: break;
        }
        return defaultProps;
    };

    // Обработчик события "бросания" модуля на MainScreen
    const handleDrop = useCallback((item, offset) => {
        clearAllDynamicStates();
        if (item.instanceId) {
            updateModulePosition(item.instanceId, offset);
        }
        else if (item.id && item.type) {
            const defaultProps = getDefaultProperties(item);
            const newInstance = {
                id: item.id, name: item.name, type: item.type, system: item.system,
                instanceId: Date.now(), properties: defaultProps, position: { x: offset.x, y: offset.y }
            };
            setMainScreenModules((prev) => [...prev, newInstance]);
        }
    }, [updateModulePosition, getDefaultProperties]);

    // Устанавливает переданный module как selectedModule
    const handleModuleClick = (module) => {
        setSelectedModule(module);
    };

    // Обновляет свойства модуля с instanceId в mainScreenModules
    const updateModuleProperties = useCallback((instanceId, newProperties) => {
        clearAllDynamicStates();
        setMainScreenModules(prevModules => prevModules.map(m =>
            m.instanceId === instanceId ? { ...m, properties: newProperties } : m
        ));
        if (selectedModule && selectedModule.instanceId === instanceId) {
            setSelectedModule(prevSelected => ({ ...prevSelected, properties: newProperties }));
        }
    }, [selectedModule]);

    // Удаляет модуль с instanceIdToDelete из mainScreenModules
    const handleDeleteModule = useCallback((instanceIdToDelete) => {
        clearAllDynamicStates();
        setMainScreenModules(prevModules => prevModules.filter(module => module.instanceId !== instanceIdToDelete));
        setConnections(prevConnections => prevConnections.filter(conn =>
            !(String(conn.sourceId).startsWith(String(instanceIdToDelete))) &&
            !(String(conn.targetId).startsWith(String(instanceIdToDelete)))
        ));
        if (selectedModule && selectedModule.instanceId === instanceIdToDelete) { setSelectedModule(null); }
    }, [selectedModule]);

    // Добавляет новое соединение в массив connections
    const handleAddConnection = useCallback((sourceId, targetPortId) => {
        clearAllDynamicStates();
        let targetInstanceId = targetPortId;
        if (typeof targetPortId === 'string' && targetPortId.includes('_in')) {
            targetInstanceId = targetPortId.split('_in')[0];
        }
        let sourceInstanceIdForSelfCheck = sourceId;
        if (typeof sourceId === 'string' && sourceId.includes('_out')) {
            sourceInstanceIdForSelfCheck = sourceId.split('_out')[0];
        }

        if (sourceInstanceIdForSelfCheck === targetInstanceId) {
            alert("Нельзя соединить модуль с самим собой или его выходной порт с его же входом.");
            return;
        }

        const targetModuleForTypeCheck = mainScreenModules.find(m => String(m.instanceId) === String(targetInstanceId));
        if (targetModuleForTypeCheck?.type === 'start' || targetModuleForTypeCheck?.type === 'engine_input') {
            alert("Нельзя подключаться К модулю Двигателя."); return;
        }

        const connectionToSpecificTargetPortExists = connections.some(conn => conn.sourceId === sourceId && conn.targetId === targetPortId);
        if (connectionToSpecificTargetPortExists) return;
        
        const isSourcePortActuallyBusy = connections.some(conn => conn.sourceId === sourceId);
        if (isSourcePortActuallyBusy) {
            const sourceModuleForTypeCheck = mainScreenModules.find(m => String(m.instanceId) === String(sourceInstanceIdForSelfCheck));
            const sourceName = sourceModuleForTypeCheck?.name || sourceId.split('_out')[0] || 'Источник';
            alert(`Выходной порт "${sourceName}" уже занят.`); return;
        }

        const isTargetPortActuallyBusy = connections.some(conn => conn.targetId === targetPortId);
        if (isTargetPortActuallyBusy) {
            const targetName = targetModuleForTypeCheck?.name || targetPortId.split('_in')[0] || 'Цель';
            alert(`Входной порт "${targetName}" уже занят.`); return;
        }

        const newConnection = { id: `conn-${Date.now()}`, sourceId: sourceId, targetId: targetPortId };
        setConnections(prevConnections => [...prevConnections, newConnection]);
    }, [connections, mainScreenModules]);

    // Удаляет соединение с connectionIdToRemove из connections
    const handleRemoveConnection = useCallback((connectionIdToRemove) => {
        clearAllDynamicStates();
        setConnections(prevConnections => prevConnections.filter(conn => conn.id !== connectionIdToRemove));
    }, []);

    // Выполняет базовую клиентскую валидацию схемы перед отправкой на сервер
    const validateSchemeForClient = () => {
        const currentErrors = [];
        const currentWarnings = [];

        const engine = mainScreenModules.find(m => m.type === 'engine_input');
        const tank = mainScreenModules.find(m => m.type === 'tank_output');
        const pumps = mainScreenModules.filter(m => m.type === 'pump');

        if (!engine) currentErrors.push("Отсутствует модуль двигателя (engine_input) на схеме.");
        if (!tank) currentErrors.push("Отсутствует модуль гидробака (tank_output) на схеме.");
        if (pumps.length === 0) currentErrors.push("Отсутствует хотя бы один модуль насоса (pump) на схеме.");

        pumps.forEach(pump => {
            const pumpInstanceIdStr = String(pump.instanceId);
            const incomingConnectionsToPump = connections.filter(conn => String(conn.targetId).split('_in')[0] === pumpInstanceIdStr);
            const outgoingConnectionsFromPump = connections.filter(conn => String(conn.sourceId).split('_out')[0] === pumpInstanceIdStr);
            if (incomingConnectionsToPump.length === 0) currentWarnings.push(`Насос "${pump.name}" (ID: ${pump.instanceId}) не имеет всасывающей линии.`);
            if (outgoingConnectionsFromPump.length === 0) currentWarnings.push(`Насос "${pump.name}" (ID: ${pump.instanceId}) не имеет напорной линии.`);
        });
        
        if (mainScreenModules.length > 2 && connections.length === 0) {
            currentWarnings.push("На схеме есть несколько модулей, но отсутствуют соединения между ними.");
        }
        
        mainScreenModules.forEach(m => {
            if (!m.properties || Object.keys(m.properties).length === 0) {
                 currentWarnings.push(`Модуль "${m.name}" (ID: ${m.instanceId}) не имеет свойств. Проверьте панель свойств.`);
            }
        });
        
        setValidationMessages({ errors: currentErrors, warnings: currentWarnings }); 
        return { errors: currentErrors, warnings: currentWarnings }; 
    };

    // Функция для запуска гидравлического расчета
    const handleProcessChain = async () => {
        clearAllDynamicStates(); 

        const validationResult = validateSchemeForClient();

        if (validationResult.errors.length > 0) {
            setIsLoading(false); 
            return; 
        }
        
        if (validationResult.warnings.length > 0) {
             if (!window.confirm("Обнаружены следующие предупреждения по схеме:\n- " + validationResult.warnings.join("\n- ") + "\n\nПродолжить расчет?")) {
                setIsLoading(false);
                return; 
            }
        }

        setValidationMessages({ errors: [], warnings: [] }); 
        const currentSelectedFluid = fluidOptions.find(f => f.key === selectedFluidKey);
        if (!currentSelectedFluid) {
            alert("Ошибка: Выбранная жидкость не найдена. Расчет невозможен.");
            setIsLoading(false);
            return;
        }

        // Формирует payload для отправки на сервер: modules, connections и свойства выбранной жидкости
        const payload = {
            modules: mainScreenModules,
            connections: connections,
            fluidProperties: { 
                density: currentSelectedFluid.density,
                kinematicViscosityM2s: currentSelectedFluid.kinematicViscosityM2s
            }
        };
        setIsLoading(true);
        setProcessingResult('Calculating...');
        
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/calculate-hydraulics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();

            if (!response.ok) {
                const errorText = data.error || `HTTP error! status: ${response.status} - ${response.statusText}`;
                console.error("Ошибка ответа сервера:", errorText, data);
                setProcessingResult(`Ошибка сервера: ${errorText}`);
                setDetailedResults(null);
                setProblematicModules([]);
                alert(`Ошибка сервера: ${errorText}`);
                return;
            }

            let tempString = 'Н/Д';
            let conclusionString = 'Нет заключения';

            if (data.thermalBalance && typeof data.thermalBalance === 'object') {
                if (data.thermalBalance.calculatedSteadyStateTempC !== null &&
                    data.thermalBalance.calculatedSteadyStateTempC !== undefined &&
                    typeof data.thermalBalance.calculatedSteadyStateTempC === 'number' &&
                    !Number.isNaN(data.thermalBalance.calculatedSteadyStateTempC)) {
                    tempString = data.thermalBalance.calculatedSteadyStateTempC.toFixed(1) + '°C';
                } else if (data.thermalBalance.calculatedSteadyStateTempC === null) {
                    tempString = 'Н/Д (бесконечность или не рассчитывалось)';
                } else {
                    tempString = 'Ошибка данных температуры';
                }
                conclusionString = data.thermalBalance.conclusion || 'Нет заключения.';
            }
            
            const resultString = `Результат: Темп. = ${tempString}. ${conclusionString}`;
            setProcessingResult(resultString);
            setCalculationResponse(data);
            setDetailedResults(data.details || {});
            
            console.log("Клиент: полученные data.details от сервера:", JSON.stringify(data.details, null, 2));

            let allProblematicIds = [];
            if (data.details) {
                Object.values(data.details).forEach(systemData => {
                    if (systemData.problematicModuleIds && Array.isArray(systemData.problematicModuleIds)) { 
                        allProblematicIds = [...allProblematicIds, ...systemData.problematicModuleIds];
                    }
                    if (systemData.branches) {
                        Object.values(systemData.branches).forEach(branch => {
                            if ((branch.isDeadEnd || branch.isBrokenPath) && branch.actualEntryNodeForPathCalc?.instanceId) {
                                const problematicId = String(branch.actualEntryNodeForPathCalc.instanceId);
                                if (!allProblematicIds.includes(problematicId)) {
                                    allProblematicIds.push(problematicId);
                                }
                            } else if (branch.isDeadEnd && branch.entryNodeInstanceId && 
                                       mainScreenModules.find(m => String(m.instanceId) === String(branch.entryNodeInstanceId))?.type === 'splitter' &&
                                       branch.deadEndMessage && branch.deadEndMessage.includes("не имеет выходных соединений")) {
                                const problematicId = String(branch.entryNodeInstanceId);
                                if (!allProblematicIds.includes(problematicId)) {
                                    allProblematicIds.push(problematicId);
                                }
                            }
                        });
                    }
                });
            }
            setProblematicModules([...new Set(allProblematicIds.map(id => String(id)))]); 

        } catch (error) {
            console.error("Ошибка обработки гидравлики:", error);
            const errorMsg = `Ошибка: ${error.message}`;
            setProcessingResult(errorMsg);
            setCalculationResponse(null);
            setDetailedResults(null);
            setProblematicModules([]);
            alert(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    // Функция для загрузки списка сохраненных схем с сервера
    const fetchSavedSchemes = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/schemes`);
            if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
            const data = await response.json();
            setSavedSchemes(data || []);
        } catch (error) { console.error("Error fetching schemes:", error); alert(`Error: ${error.message}`); setSavedSchemes([]); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchSavedSchemes(); }, [fetchSavedSchemes]);

    // Функция для сохранения текущей схемы
    const handleSaveScheme = async () => {
        // Проверяет, существует ли схема с таким именем. Если да, и пользователь согласен перезаписать, используется ID существующей схемы 
        // для PUT-запроса. Иначе – POST-запрос для создания новой
        clearAllDynamicStates();
        const currentSchemeName = mainScreenModules.find(m => m.isCurrentlyEditing)?.name || ''; 
        const schemeName = prompt("Введите имя для вашей схемы:", currentSchemeName);
        if (!schemeName) { return; }
        
        setIsLoading(true);
        
        const existingSchemeByName = savedSchemes.find(s => s.name === schemeName);
        let schemeToSaveId = null;

        if (existingSchemeByName) {
            if (window.confirm(`Схема с именем "${schemeName}" уже существует. Хотите перезаписать её?`)) {
                schemeToSaveId = existingSchemeByName._id;
            } else {
                setIsLoading(false);
                return; 
            }
        }

        const payload = { name: schemeName, data: { modules: mainScreenModules, connections: connections } };
        
        try {
            let response;
            let savedScheme;

            if (schemeToSaveId) { 
                response = await fetch(`${process.env.REACT_APP_API_URL}/schemes/${schemeToSaveId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else { 
                response = await fetch(`${process.env.REACT_APP_API_URL}/schemes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) { 
                const errorData = await response.json(); 
                throw new Error(errorData.error || `HTTP error! status: ${response.status} - ${response.statusText}`); 
            }
            savedScheme = await response.json();
            alert(`Схема "${savedScheme.name}" успешно ${schemeToSaveId ? 'обновлена' : 'сохранена'}!`);
            fetchSavedSchemes(); 
        } catch (error) { 
            console.error("Ошибка сохранения/обновления схемы:", error); 
            alert(`Ошибка: ${error.message}`); 
        }
        finally { setIsLoading(false); }
    };

    // Функция для удаления сохраненной схемы
    const handleDeleteScheme = async (schemeId) => {
        if (!schemeId) return;
        setIsLoading(true);
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/schemes/${schemeId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                let errorText = await response.text();
                let errorData;
                try { errorData = JSON.parse(errorText); } 
                catch (e) { errorData = { error: `HTTP error! status: ${response.status}`, details: errorText };}
                throw new Error(errorData.error || `HTTP error! status: ${response.status} - ${response.statusText}`);
            }
            const result = await response.json(); 
            alert(result.message || `Схема успешно удалена!`);
            fetchSavedSchemes(); 
        } catch (error) { 
            console.error("Ошибка удаления схемы (catch):", error); 
            alert(`Ошибка: ${error.message}`); 
        }
        finally { setIsLoading(false); }
    };

    // Функция для загрузки сохраненной схемы
    const handleLoadScheme = async (schemeId) => {
        clearAllDynamicStates();
        if (!schemeId) return;
        setIsLoading(true); setIsLoadModalOpen(false);
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/schemes/${schemeId}`);
            if (!response.ok) {
                if (response.status === 404) { throw new Error("Scheme not found."); }
                const errorData = await response.json(); throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const scheme = await response.json();
            setMainScreenModules(scheme.data.modules || []);
            setConnections(scheme.data.connections || []);
            setSelectedModule(null);
            alert(`Схема "${scheme.name}" успешно загружена!`);
        } catch (error) { console.error("Error loading scheme:", error); alert(`Error: ${error.message}`); }
        finally { setIsLoading(false); }
    };

    const openLoadModal = () => { fetchSavedSchemes(); setIsLoadModalOpen(true); };
    const closeLoadModal = () => { setIsLoadModalOpen(false); };

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="app">
                <div className="left-panel">
                    <div className="controls-section top-controls">
                        <button onClick={handleSaveScheme} disabled={isLoading}>{isLoading ? 'Сохранение...' : 'Сохранить схему'}</button>
                        <button onClick={openLoadModal} disabled={isLoading}>{isLoading ? 'Загрузка...' : 'Загрузить схему'}</button>
                        <button 
                            onClick={handleProcessChain} 
                            disabled={isLoading || mainScreenModules.length === 0}
                            style={mainScreenModules.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        >
                            Рассчитать гидравлику
                        </button>
                        {isLoading && <span className="loading-indicator"> Загрузка...</span>}
                    </div>
                    <div className="fluid-selector-section controls-section">
                        <label htmlFor="fluid-select">Рабочая жидкость:</label>
                        <select 
                            id="fluid-select" 
                            value={selectedFluidKey} 
                            onChange={handleFluidChange}
                            disabled={isLoading}
                        >
                            {fluidOptions.map(option => (
                                <option key={option.key} value={option.key}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {(validationMessages.errors.length > 0 || validationMessages.warnings.length > 0) && (
                        <div className="validation-messages-container">
                            {validationMessages.errors.length > 0 && (
                                <div className="validation-errors">
                                    <strong>Ошибки схемы:</strong>
                                    <ul>
                                        {validationMessages.errors.map((err, i) => <li key={`err-${i}`}>{err}</li>)}
                                    </ul>
                                </div>
                            )}
                            {validationMessages.warnings.length > 0 && validationMessages.errors.length === 0 && ( 
                                <div className="validation-warnings">
                                    <strong>Предупреждения:</strong>
                                    <ul>
                                        {validationMessages.warnings.map((warn, i) => <li key={`warn-${i}`}>{warn}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                    <Catalog />
                </div>

                <div className="main-work-area">
                    <MainScreen
                        modules={mainScreenModules}
                        connections={connections}
                        onDrop={handleDrop}
                        onModuleClick={handleModuleClick}
                        updateModulePosition={updateModulePosition}
                        onAddConnection={handleAddConnection}
                        onRemoveConnection={handleRemoveConnection}
                        selectedModule={selectedModule}
                        detailedResults={detailedResults}
                        problematicModules={problematicModules} 
                        onDeselectModule={deselectModule}
                    />

                    {(processingResult || calculationResponse) && (
                        <div className={`results-summary-bar ${isResultsPanelOpen ? 'open' : ''}`} onClick={toggleResultsPanel}>
                            <span>{processingResult || "Показать/Скрыть результаты"}</span>
                            <span className="results-toggle-arrow">{isResultsPanelOpen ? '▼' : '▲'}</span>
                        </div>
                    )}

                    {isResultsPanelOpen && calculationResponse && (
                        <div className="results-panel">
                            <ResultsDisplay
                                resultsData={calculationResponse}
                                allModules={mainScreenModules}
                            />
                        </div>
                    )}
                </div>

                <PropertiesScreen
                    selectedModule={selectedModule}
                    updateModuleProperties={updateModuleProperties}
                    onDeleteModule={handleDeleteModule}
                    detailedResults={calculationResponse?.details}
                    getDefaultProperties={getDefaultProperties}
                />
                <LoadSchemeModal
                    isOpen={isLoadModalOpen}
                    onClose={closeLoadModal}
                    schemes={savedSchemes}
                    onLoad={handleLoadScheme}
                    onDelete={handleDeleteScheme}
                    isLoading={isLoading}
                />
            </div>
        </DndProvider>
    );
}

export default App;