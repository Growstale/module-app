import React, { useState, useCallback, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Catalog from './components/Catalog';
import MainScreen from './components/MainScreen';
import PropertiesScreen from './components/PropertiesScreen';
import LoadSchemeModal from './components/LoadSchemeModal';
import ResultsDisplay from './components/ResultsDisplay';
import './styles/App.css';

const API_BASE_URL = 'http://localhost:5001/api';

function App() {
    const [selectedModule, setSelectedModule] = useState(null);
    const [mainScreenModules, setMainScreenModules] = useState([]);
    const [connections, setConnections] = useState([]);
    const [processingResult, setProcessingResult] = useState('');
    const [savedSchemes, setSavedSchemes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
    const [detailedResults, setDetailedResults] = useState(null);
    const [calculationResponse, setCalculationResponse] = useState(null);
    const [isResultsPanelOpen, setIsResultsPanelOpen] = useState(false);

    const toggleResultsPanel = () => {
        setIsResultsPanelOpen(prev => !prev);
    };

    const updateModulePosition = useCallback((instanceId, newPosition) => {
        setMainScreenModules(prevModules =>
            prevModules.map(module =>
                module.instanceId === instanceId ? { ...module, position: newPosition } : module
            )
        );
        if (selectedModule && selectedModule.instanceId === instanceId) {
            setSelectedModule(prevSelected => ({ ...prevSelected, position: newPosition }));
        }
    }, [selectedModule]);

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
            default: break;
        }
        return defaultProps;
    };

    const handleDrop = useCallback((item, offset) => {
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
            setProcessingResult('');
        }
    }, [updateModulePosition]);

    const handleModuleClick = (module) => { setSelectedModule(module); };

    const updateModuleProperties = useCallback((instanceId, newProperties) => {
        setMainScreenModules(prevModules => prevModules.map(m =>
            m.instanceId === instanceId ? { ...m, properties: newProperties } : m
        ));
        if (selectedModule && selectedModule.instanceId === instanceId) {
            setSelectedModule(prevSelected => ({ ...prevSelected, properties: newProperties }));
        }
        setProcessingResult('');
    }, [selectedModule]);

    const handleDeleteModule = useCallback((instanceIdToDelete) => {
        setMainScreenModules(prevModules => prevModules.filter(module => module.instanceId !== instanceIdToDelete));
        setConnections(prevConnections => prevConnections.filter(conn =>
            !(String(conn.sourceId).startsWith(String(instanceIdToDelete))) &&
            !(String(conn.targetId).startsWith(String(instanceIdToDelete)))
        ));
        if (selectedModule && selectedModule.instanceId === instanceIdToDelete) { setSelectedModule(null); }
        setProcessingResult('');
    }, [selectedModule]);

    const handleAddConnection = useCallback((sourceId, targetPortId) => {
        let targetInstanceId = targetPortId;
        if (typeof targetPortId === 'string' && targetPortId.includes('_in')) {
            targetInstanceId = targetPortId.split('_in')[0];
        }
        let sourceInstanceIdForSelfCheck = sourceId;
        if (typeof sourceId === 'string' && sourceId.includes('_out')) {
            sourceInstanceIdForSelfCheck = sourceId.split('_out')[0];
        }

        if (sourceInstanceIdForSelfCheck === targetInstanceId) {
            alert("Cannot connect module to itself or its own output port to its input.");
            return;
        }

        const targetModuleForTypeCheck = mainScreenModules.find(m => String(m.instanceId) === String(targetInstanceId));
        if (targetModuleForTypeCheck?.type === 'start' || targetModuleForTypeCheck?.type === 'engine_input') {
            console.warn("[handleAddConnection] FAILED: Cannot connect TO a Start/Engine node.");
            alert("Cannot connect TO a Start/Engine node."); return;
        }

        const sourceModuleForTypeCheck = mainScreenModules.find(m => String(m.instanceId) === String(sourceInstanceIdForSelfCheck));
        if (sourceModuleForTypeCheck?.type === 'end' || (sourceModuleForTypeCheck?.type === 'tank_output' && !(typeof sourceId === 'string' && sourceId.includes('_out')))) {
        }

        const connectionToSpecificTargetPortExists = connections.some(conn => conn.sourceId === sourceId && conn.targetId === targetPortId);
        if (connectionToSpecificTargetPortExists) {
            return;
        }

        const isSourcePortActuallyBusy = connections.some(conn => conn.sourceId === sourceId);
        if (isSourcePortActuallyBusy) {
            const sourceName = sourceModuleForTypeCheck?.name || sourceId.split('_out')[0] || 'Source';
            console.warn(`[handleAddConnection] FAILED: Output port of "${sourceName}" is already connected.`);
            alert(`Output port of "${sourceName}" is already connected.`); return;
        }

        const isTargetPortActuallyBusy = connections.some(conn => conn.targetId === targetPortId);
        if (isTargetPortActuallyBusy) {
            const targetName = targetModuleForTypeCheck?.name || targetPortId.split('_in')[0] || 'Target';
            console.warn(`[handleAddConnection] FAILED: Input port of "${targetName}" is already connected.`);
            alert(`Input port of "${targetName}" is already connected.`); return;
        }

        const newConnection = { id: `conn-${Date.now()}`, sourceId: sourceId, targetId: targetPortId };
        setConnections(prevConnections => {
            const updatedConnections = [...prevConnections, newConnection];
            return updatedConnections;
        });
        setProcessingResult('');
    }, [connections, mainScreenModules]);

    const handleRemoveConnection = useCallback((connectionIdToRemove) => {
        setConnections(prevConnections => prevConnections.filter(conn => conn.id !== connectionIdToRemove));
        setProcessingResult('');
    }, []);

    const handleProcessChain = async () => {
        const payload = {
            modules: mainScreenModules,
            connections: connections,
        };
        setIsLoading(true);
        setProcessingResult('Calculating...');
        setDetailedResults(null);
        try {
            const response = await fetch(`${API_BASE_URL}/calculate-hydraulics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();

            if (!response.ok) {
                const errorText = data.error || `HTTP error! status: ${response.status}`;
                console.error("Ошибка ответа сервера:", errorText, data);
                setProcessingResult(`Server Error: ${errorText}`);
                setDetailedResults(null);
                setIsLoading(false);
                alert(`Server Error: ${errorText}`);
                return;
            }

            let tempString = 'N/A';
            let conclusionString = 'No conclusion.';

            if (data.thermalBalance && typeof data.thermalBalance === 'object') {
                if (data.thermalBalance.calculatedSteadyStateTempC !== null &&
                    data.thermalBalance.calculatedSteadyStateTempC !== undefined &&
                    typeof data.thermalBalance.calculatedSteadyStateTempC === 'number' &&
                    !Number.isNaN(data.thermalBalance.calculatedSteadyStateTempC)) {
                    tempString = data.thermalBalance.calculatedSteadyStateTempC.toFixed(1) + '°C';
                } else if (data.thermalBalance.calculatedSteadyStateTempC === null) {
                    tempString = 'N/A (бесконечность или не рассчитывалось)';
                } else {
                    console.warn("calculatedSteadyStateTempC имеет неверный формат или отсутствует:", data.thermalBalance.calculatedSteadyStateTempC);
                    tempString = 'Ошибка данных температуры';
                }
                conclusionString = data.thermalBalance.conclusion || 'Нет заключения.';
            } else {
                console.warn("Объект data.thermalBalance отсутствует или имеет неверный формат в ответе сервера!");
                conclusionString = 'Данные теплового баланса не получены.';
            }

            const resultString = `Result: Temp = ${tempString}. ${conclusionString}`;
            setProcessingResult(resultString);
            setCalculationResponse(data);
            setDetailedResults(data.details || {});
        } catch (error) {
            console.error("Error processing hydraulics:", error);
            const errorMsg = `Error: ${error.message}`;
            setProcessingResult(errorMsg);
            setCalculationResponse(null);
            setDetailedResults(null);
            alert(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSavedSchemes = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/schemes`);
            if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
            const data = await response.json();
            setSavedSchemes(data || []);
        } catch (error) { console.error("Error fetching schemes:", error); alert(`Error: ${error.message}`); setSavedSchemes([]); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchSavedSchemes(); }, [fetchSavedSchemes]);

    const handleSaveScheme = async () => {
        const schemeName = prompt("Enter a name for your scheme:");
        if (!schemeName) { return; }
        setIsLoading(true);
        const payload = { name: schemeName, data: { modules: mainScreenModules, connections: connections } };
        try {
            const response = await fetch(`${API_BASE_URL}/schemes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || `HTTP error! status: ${response.status}`); }
            const savedScheme = await response.json();
            alert(`Scheme "${savedScheme.name}" saved successfully!`);
            fetchSavedSchemes();
        } catch (error) { console.error("Error saving scheme:", error); alert(`Error: ${error.message}`); }
        finally { setIsLoading(false); }
    };

    const handleLoadScheme = async (schemeId) => {
        if (!schemeId) return;
        setIsLoading(true); setIsLoadModalOpen(false);
        try {
            const response = await fetch(`${API_BASE_URL}/schemes/${schemeId}`);
            if (!response.ok) {
                if (response.status === 404) { throw new Error("Scheme not found."); }
                const errorData = await response.json(); throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const scheme = await response.json();
            setMainScreenModules(scheme.data.modules || []);
            setConnections(scheme.data.connections || []);
            setSelectedModule(null);
            setProcessingResult('');
            alert(`Scheme "${scheme.name}" loaded successfully!`);
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
                        <button onClick={handleSaveScheme} disabled={isLoading}>{isLoading ? 'Saving...' : 'Save Scheme'}</button>
                        <button onClick={openLoadModal} disabled={isLoading}>{isLoading ? 'Loading...' : 'Load Scheme'}</button>
                        <button onClick={handleProcessChain} disabled={isLoading || mainScreenModules.length === 0}>Calculate Hydraulics</button>
                        {isLoading && <span className="loading-indicator"> Loading...</span>}
                    </div>
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
                    isLoading={isLoading}
                />
            </div>
        </DndProvider>
    );
}

export default App;