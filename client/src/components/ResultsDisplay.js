import React from 'react';
import '../styles/ResultsDisplay.css';

const ResultsDisplay = ({ resultsData, allModules }) => {
    if (!resultsData || !resultsData.details || Object.keys(resultsData.details).length === 0) {
        return null;
    }

    const formatValue = (value, unit = '', precision = 2) => {
        if (value === null || value === undefined) {
            return `Н/Д ${unit}`;
        }
        if (typeof value === 'number') {
            if (Number.isNaN(value)) {
                return `Ошибка ${unit}`;
            }
            if (Math.abs(value) < 1e-9 && value !== 0) {
                return `${value.toExponential(precision)} ${unit}`;
            }
            return `${value.toFixed(precision)} ${unit}`;
        }
        return `${value} ${unit}`;
    };

    const getSpeedStyle = (speedMs, lineTypeForStyle) => {
        let style = {};
        const lowerLineType = lineTypeForStyle.toLowerCase();
        if (lowerLineType.includes('напорная') || lowerLineType.includes('общего напорного участка')) {
            if (speedMs < 3.0) style.color = 'blue';
            else if (speedMs > 5.0) style.color = 'red';
        } else if (lowerLineType.includes('сливная') || lowerLineType.includes('всасывающ')) { // Для всасывающей тоже применим пороги сливной
            if (speedMs < 2.0) style.color = 'blue';
            else if (speedMs > 3.0) style.color = 'red';
        }
        return style;
    };

    const renderPipeDetails = (pipes, lineDescription, lineTypeForStyle) => {
        if (!pipes || pipes.length === 0) {
            // Убрал сообщение "Нет данных...", чтобы не загромождать вывод, если секция просто пуста
            return null; 
        }
        return (
            <div className="pipe-details-section">
                <strong>Трубы {lineDescription}:</strong>
                <table>
                    <thead>
                        <tr>
                            <th>Название/ID</th>
                            <th>D (мм)</th>
                            <th>L (м)</th>
                            <th>Скорость (м/с)</th>
                            <th>Re</th>
                            <th>λ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pipes.map(pipe => (
                            <tr key={pipe.instanceId}>
                                <td>{pipe.name} ({String(pipe.instanceId).slice(-4)})</td>
                                <td>{formatValue(pipe.diameterM * 1000, '', 1)}</td>
                                <td>{formatValue(pipe.lengthM, '', 2)}</td>
                                <td style={getSpeedStyle(pipe.velocityMs, lineTypeForStyle)}>{formatValue(pipe.velocityMs, '', 3)}</td>
                                <td>{formatValue(pipe.reynolds, '', 0)}</td>
                                <td>{formatValue(pipe.lambda, '', 4)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderThermalBalance = (thermalData) => {
        if (!thermalData) {
            console.error("[renderThermalBalance] thermalData is undefined or null!");
            return <p>Данные теплового баланса отсутствуют.</p>;
        }
        const calculatedSteadyStateTempC = thermalData.calculatedSteadyStateTempC;
        const requiredTankAreaM2 = thermalData.requiredTankAreaM2 ?? 0;
        const currentEffectiveTankAreaM2 = thermalData.currentEffectiveTankAreaM2 ?? 0;
        const totalHeatGeneratedKw = thermalData.totalHeatGeneratedKw ?? 0;
        const totalEquipmentSurfaceM2 = thermalData.totalEquipmentSurfaceM2 ?? 0;
        const ambientTempC = thermalData.ambientTempC ?? 20;
        const heatTransferCoeff = thermalData.heatTransferCoeff ?? 15;
        const conclusion = thermalData.conclusion || "Нет данных.";
        const totalHeatExchangeAreaM2 = totalEquipmentSurfaceM2 + currentEffectiveTankAreaM2;
        return (
            <div className="thermal-balance-section system-card">
                <h4>Тепловой Баланс Системы (Общий):</h4>
                <ul>
                    <li>Общее тепловыделение (Q1): {formatValue(totalHeatGeneratedKw, 'кВт', 3)}</li>
                    <li>Площадь поверхности гидрооборудования (Fоб): {formatValue(totalEquipmentSurfaceM2, 'м²', 4)}</li>
                    <li>Эффективная площадь пов. гидробака (Fбпр): {formatValue(currentEffectiveTankAreaM2, 'м²', 2)}</li>
                    <li>Общая площадь теплообмена (F_общ): {formatValue(totalHeatExchangeAreaM2, 'м²', 2)}</li>
                    <li>Температура окруж. воздуха (tв max): {formatValue(ambientTempC, '°C', 1)}</li>
                    <li>Коэффициент теплопередачи (K): {formatValue(heatTransferCoeff, 'Вт/м²°С', 0)}</li>
                    <li style={{ fontWeight: 'bold' }}>Расчетная установившаяся температура (tж расч): {formatValue(calculatedSteadyStateTempC, '°C', 1)}</li>
                    <li>Целевая максимальная температура (tж цель): {formatValue(70, '°C', 0)}</li>
                    {(totalHeatGeneratedKw > 0) && ((calculatedSteadyStateTempC === null || calculatedSteadyStateTempC > 70) || requiredTankAreaM2 > currentEffectiveTankAreaM2) &&
                        <li>Необходимая эффективная площадь бака (Fб необх.): {formatValue(requiredTankAreaM2, 'м²', 2)}</li>
                    }
                </ul>
                <p><strong>Заключение по тепловому расчету:</strong> {conclusion}</p>
            </div>
        );
    };

    
    return (
        <div className="results-display-container">
            <h3>Детализация Расчетов Системы:</h3>
            {/* Блок для отображения предупреждений */}
            {resultsData.details && Object.entries(resultsData.details).map(([systemKey, systemData]) => (
                <React.Fragment key={`warnings-${systemKey}`}>
                    {systemData.schemaWarnings && systemData.schemaWarnings.length > 0 && (
                        <div className="system-warnings system-card">
                            <h4>Предупреждения для системы: {systemKey.replace(/_/g, ' ')}</h4>
                            <ul>
                                {systemData.schemaWarnings.map((warning, index) => (
                                    <li key={`sys-warn-${index}`} style={{ color: 'orange', fontWeight: 'bold' }}>{warning}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {/* Предупреждения для отдельных веток */}
                    {systemData.branches && Object.values(systemData.branches).some(branch => branch.isDeadEnd || branch.isBrokenPath) && (
                         <div className="branch-warnings system-card">
                            <h5>Предупреждения по веткам системы: {systemKey.replace(/_/g, ' ')}</h5>
                            <ul>
                                {Object.values(systemData.branches).map(branch => {
                                    if (branch.isDeadEnd || branch.isBrokenPath) {
                                        return (
                                            <li key={`branch-warn-${branch.branchName}`} style={{ color: 'darkorange' }}>
                                                Ветка "{branch.branchName.replace(/_/g, ' ')}": {branch.deadEndMessage || branch.brokenPathMessage}
                                            </li>
                                        );
                                    }
                                    return null;
                                })}
                            </ul>
                        </div>
                    )}
                </React.Fragment>
            ))}
            {/* Конец блока предупреждений */}

            {resultsData.details && Object.entries(resultsData.details).map(([systemKey, systemData]) => {
                const commonPathPipeInstanceIds = (systemData.commonPathPipeDetails || []).map(p => String(p.instanceId)); // <--- НОВОЕ
                const allCommonDrainPipeInstanceIdsFromCollectors = Object.values(systemData.commonDrainPipesByCollector || {})
                    .flat()
                    .map(p => String(p.instanceId));

                return (
                    <div key={systemKey} className="system-card">
                        <h4>Система: {systemKey.replace(/_/g, ' ')}</h4>
                        <div className="system-summary">
                            <p><strong>Насос:</strong></p>
                            <ul>
                                <li>Подача: {formatValue(systemData.pumpFlowLmin, 'л/мин')} ({formatValue(systemData.pumpFlowM3s, 'м³/с', 6)})</li>
                                <li>Давление на выходе: {formatValue(systemData.actualOutletPressureMPa, 'МПа')}</li>
                                <li>Мощность на валу: {formatValue(systemData.powerInputKw, 'кВт')}</li>
                            </ul>
                            <p><strong>КПД Системы (от вала насоса до полезной мех. работы):</strong></p>
                            <ul>
                                <li>Общий (полный) КПД системы: {formatValue(systemData.overallSystemEfficiency, '', 4)}</li>
                            </ul>
                            <p><strong>Составляющие КПД системы (от выхода насоса до полезной гидравл. работы на цилиндрах):</strong></p>
                            <ul>
                                <li>Гидравлический КПД (глоб.): {formatValue(systemData.systemHydraulicEfficiencyGlobal, '', 3)}</li>
                                <li>Объемный КПД (глоб. после насоса): {formatValue(systemData.systemVolumetricEfficiencyGlobal, '', 3)}</li>
                            </ul>
                        </div>

                        {systemData.suctionLinePipeDetails && systemData.suctionLinePipeDetails.length > 0 && (
                            <div className="suction-line-section branch-card">
                                <h6>Всасывающая линия:</h6>
                                {renderPipeDetails(systemData.suctionLinePipeDetails, "всасывающей линии", "всасывающая")}
                            </div>
                        )}

                        {systemData.commonPathPipeDetails && systemData.commonPathPipeDetails.length > 0 && (
                            <div className="common-pressure-section branch-card">
                                <h6>Общий напорный участок (до разветвления):</h6>
                                {renderPipeDetails(systemData.commonPathPipeDetails, "общего напорного участка", "напорная")}
                            </div>
                        )}
                        
                        <h5>Ветки данной системы:</h5>
                        {systemData.branches && Object.entries(systemData.branches).map(([branchKey, branchData]) => {
                            
                            const pressurePipesForThisBranch = (branchData.pressureLinePipeDetails || []).filter( // <--- ИЗМЕНЕНИЕ
                                pipe => !commonPathPipeInstanceIds.includes(String(pipe.instanceId)) // <--- ИЗМЕНЕНИЕ
                            );
                            const drainPipesForThisBranchOnly = (branchData.drainLinePipeDetails || []).filter(
                                pipe => !allCommonDrainPipeInstanceIdsFromCollectors.includes(String(pipe.instanceId))
                            );

                            return (
                                <div key={branchKey} className="branch-card">
                                    <h6>Ветка: {branchKey.replace(/_/g, ' ')}</h6>
                                    <p>Требуемое давление на входе "чистой" ветки: {formatValue(branchData.requiredBranchPressureMPa, 'МПа')}</p>
                                    {branchData.efficiency && (
                                        <p>КПД "чистой" ветки (от ее входа):
                                            Гидр: {formatValue(branchData.efficiency.hydraulic, '', 3)},
                                            Мех: {formatValue(branchData.efficiency.mechanical, '', 3)},
                                            Об: {formatValue(branchData.efficiency.volumetric, '', 3)},
                                            Общ: {formatValue(branchData.efficiency.total, '', 4)}
                                        </p>
                                    )}
                                    {branchData.cylinderCalculatedParams && (
                                        <div className="cylinder-details">
                                            <p><strong>Расчетные параметры цилиндра:</strong></p>
                                            <ul>
                                                <li>Давление в поршневой полости: {formatValue(branchData.cylinderCalculatedParams.pistonChamberPressureMPa, 'МПа')}</li>
                                                <li>Давление в штоковой полости: {formatValue(branchData.cylinderCalculatedParams.rodChamberPressureMPa, 'МПа')}</li>
                                                <li>Скорость штока: {formatValue(branchData.cylinderCalculatedParams.rodSpeedMs, 'м/с', 4)}</li>
                                                <li>Полезная мощность на штоке: {formatValue(branchData.cylinderCalculatedParams.usefulPowerKw, 'кВт')}</li>
                                                <li>Фактический поток в цилиндр: {formatValue((branchData.cylinderCalculatedParams.actualFlowToCylinderM3s || 0) * 60000, 'л/мин')}</li>
                                            </ul>
                                        </div>
                                    )}
                                    
                                    {/* НОВЫЙ БЛОК для мотора (или убедись, что он есть и работает) */}
                                    {branchData.motorCalculatedParams && (
                                        <div className="motor-details"> {/* Или actuator-details */}
                                            <p><strong>Расчетные параметры гидромотора:</strong></p>
                                            <ul>
                                                <li>Перепад давления: {formatValue(branchData.motorCalculatedParams.pressureDropMPa, 'МПа')}</li>
                                                <li>Частота вращения: {formatValue(branchData.motorCalculatedParams.rpm, 'об/мин', 1)}</li>
                                                <li>Полезная мощность на валу: {formatValue(branchData.motorCalculatedParams.usefulPowerKw, 'кВт')}</li>
                                                <li>Фактический поток через мотор: {formatValue((branchData.motorCalculatedParams.actualFlowToMotorM3s || 0) * 60000, 'л/мин')}</li>
                                            </ul>
                                        </div>
                                    )}

                                    {pressurePipesForThisBranch.length > 0 && renderPipeDetails(pressurePipesForThisBranch, "напорной линии ветки", "напорная")} {/* Используем отфильтрованный массив */}
                                    {drainPipesForThisBranchOnly.length > 0 && renderPipeDetails(drainPipesForThisBranchOnly, "сливной линии ветки (до слияния/коллектора)", "сливная")}
                                </div>
                            );
                        })}
                        
                        {Object.keys(systemData.branches || {}).length === 0 && <p>Нет активных веток для отображения в этой системе.</p>}

                        {Object.entries(systemData.commonDrainPipesByCollector || {}).map(([collectorId, pipes]) => {
                            const collectorModule = allModules?.find(m => String(m.instanceId) === collectorId);
                            const collectorName = collectorModule ? collectorModule.name : `Коллектор ID ${String(collectorId).slice(-4)}`;
                            if (pipes && pipes.length > 0) {
                                return (
                                    <div key={`common-drain-${collectorId}`} className="common-drain-section branch-card"> {/* Можно переименовать класс для специфичности */}
                                        <h6>Общий слив после "{collectorName}":</h6>
                                        {renderPipeDetails(pipes, `общей сливной линии от "${collectorName}"`, "сливная")}
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>
                );
            })}
            {resultsData.thermalBalance && renderThermalBalance(resultsData.thermalBalance)}
        </div>
    );
};

export default ResultsDisplay;