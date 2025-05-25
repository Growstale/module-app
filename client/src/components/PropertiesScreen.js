import React, { useState, useEffect } from 'react';
import '../styles/PropertiesScreen.css';

const PropertiesScreen = ({ selectedModule, updateModuleProperties, onDeleteModule, detailedResults, getDefaultProperties }) => {
  const [properties, setProperties] = useState({});
  const [moduleName, setModuleName] = useState('');
  const [calculatedCylinderParams, setCalculatedCylinderParams] = useState(null);

  useEffect(() => {
    if (selectedModule) {
      setProperties(selectedModule.properties || {});
      setModuleName(selectedModule.name || '');
      let foundParams = null;
      if (selectedModule.type === 'cylinder' && detailedResults) {
        for (const systemKey in detailedResults) {
          const systemData = detailedResults[systemKey];
          if (systemData.branches) {
            for (const branchKey in systemData.branches) {
              const branchData = systemData.branches[branchKey];
              if (
                branchData.cylinderCalculatedParams &&
                String(branchData.cylinderCalculatedParams.cylinderInstanceId) === String(selectedModule.instanceId)
              ) {
                foundParams = branchData.cylinderCalculatedParams;
                break;
              }
            }
          }
          if (foundParams) break;
        }
      }
      setCalculatedCylinderParams(foundParams);
    } else {
      setProperties({});
      setModuleName('');
      setCalculatedCylinderParams(null);
    }
  }, [selectedModule, detailedResults]);

  const handlePropertyChange = (e) => {
    const { name, value, type, checked } = e.target;
    let processedValue;

    if (type === 'checkbox') {
      processedValue = checked;
    } else if (type === 'number') {
      const numValue = parseFloat(value);
      if (name === 'volumetricEff' || name === 'mechEff' || name === 'volEff') {
        if (numValue < 0) processedValue = 0;
        else if (numValue > 1) processedValue = 1;
        else processedValue = numValue || 0;
      } else if (
        [
          'workingVolume', 'force', 'idleRpm', 'nominalRpm', 'maxTorqueRpm', 'driveRatio',
          'pistonDiameter', 'rodDiameter', 'stroke', 'pressureDrop', 'nominalFlowLmin',
          'internalLeakage', 'sideSurfaceArea', 'filtrationRate', 'length', 'diameter',
          'roughness', 'localResistanceCoeff', 'nominalPressureMPa'
        ].includes(name)
      ) {
        processedValue = Math.max(0, numValue || 0);
      } else {
        processedValue = numValue || 0;
      }
    } else {
      processedValue = value;
    }
    setProperties(prevProps => ({
      ...prevProps,
      [name]: processedValue
    }));
  };

  const handleSave = () => {
    if (selectedModule) {
      updateModuleProperties(selectedModule.instanceId, properties);
      alert(`Properties for "${moduleName}" saved!`);
    }
  };

  const handleDelete = () => {
    if (selectedModule && onDeleteModule) {
      if (selectedModule.type === 'engine_input' || selectedModule.type === 'tank_output') {
        alert(`Module "${moduleName}" cannot be deleted.`);
        return;
      }
      if (window.confirm(`Are you sure you want to delete the module "${moduleName}"? This action cannot be undone.`)) {
        onDeleteModule(selectedModule.instanceId);
      }
    }
  };

  const handleResetToDefaults = () => {
    if (selectedModule && getDefaultProperties) {
      const defaultProps = getDefaultProperties(selectedModule);
      setProperties(defaultProps);
    }
  };

  const renderInputField = (label, name, unit = '', type = 'number', step = 'any', props = {}, tooltipText = '') => (
    <div key={name} className="property-field" title={tooltipText || label}>
      <label htmlFor={`prop-${name}`}>{label}:</label>
      <div className="input-wrapper">
        <input
          type={type}
          id={`prop-${name}`}
          name={name}
          value={properties[name] ?? (type === 'number' ? 0 : (type === 'color' ? '#9e9e9e' : ''))}
          onChange={handlePropertyChange}
          step={step}
          {...props}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );

  const renderRadioGroup = (groupLabel, name, options, tooltipText = '') => (
    <div key={name} className="property-field radio-group" title={tooltipText || groupLabel}>
      <label className="group-label">{groupLabel}:</label>
      <div className="radio-options">
        {options.map(opt => (
          <label key={opt.value} htmlFor={`prop-${name}-${opt.value}`}>
            <input
              type="radio"
              id={`prop-${name}-${opt.value}`}
              name={name}
              value={opt.value}
              checked={properties[name] === opt.value}
              onChange={handlePropertyChange}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );

  const renderPropertyGroupTitle = (title) => (
    <h4 className="property-group-title">{title}</h4>
  );

  if (!selectedModule) {
    return <div className="properties-screen">Select a module to configure</div>;
  }

  const renderProperties = () => {
    switch (selectedModule.id) {
      case 'engine_d245':
        return (
          <>
            {renderPropertyGroupTitle('Параметры двигателя')}
            {renderInputField('Обороты ХХ (Nхх)', 'idleRpm', 'об/мин', 'number', 'any', { min: 0 }, "Обороты холостого хода двигателя")}
            {renderInputField('Ном. обороты (Nном)', 'nominalRpm', 'об/мин', 'number', 'any', { min: 0 }, "Номинальные обороты двигателя")}
            {renderInputField('Обороты макс. момента (Nmax)', 'maxTorqueRpm', 'об/мин', 'number', 'any', { min: 0 }, "Обороты двигателя при максимальном крутящем моменте")}
            {renderRadioGroup('Режим для расчета', 'selectedRpmMode', [
              { value: 'idleRpm', label: 'ХХ' },
              { value: 'nominalRpm', label: 'Ном.' },
              { value: 'maxTorqueRpm', label: 'Макс. момент' }
            ], "Выберите режим работы двигателя для текущего расчета")}
          </>
        );
      case 'tank':
        return (
          <>
            {renderPropertyGroupTitle('Геометрические параметры бака')}
            {renderInputField('Длина (L)', 'length', 'м', 'number', 'any', { min: 0 }, "Длина гидробака")}
            {renderInputField('Ширина (S)', 'width', 'м', 'number', 'any', { min: 0 }, "Ширина гидробака")}
            {renderInputField('Высота (H)', 'height', 'м', 'number', 'any', { min: 0 }, "Общая высота гидробака")}
          </>
        );
      case 'pump_gns_ap30':
      case 'pump_gru_nsh10':
        return (
          <>
            {renderPropertyGroupTitle('Основные параметры насоса')}
            {renderInputField('Рабочий объем (Vн)', 'workingVolume', 'см³/об', 'number', 'any', { min: 0 }, "Объем жидкости, вытесняемый насосом за один оборот")}
            {renderInputField('Передаточное число (i)', 'driveRatio', '', 'number', 'any', { min: 0 }, "Передаточное число привода насоса от двигателя")}
            {renderInputField('Номинальное давление', 'nominalPressureMPa', 'МПа', 'number', 'any', { min: 0 }, "Номинальное рабочее давление насоса (для справки)")}
            {renderPropertyGroupTitle('Эффективность насоса')}
            {renderInputField('Объемный КПД (ηv)', 'volumetricEff', '', 'number', '0.01', { min: 0, max: 1 }, "Объемный коэффициент полезного действия")}
            {renderInputField('Мех. КПД (ηм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 }, "Механический коэффициент полезного действия")}
            {renderPropertyGroupTitle('Тепловые параметры насоса')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь боковой поверхности насоса для теплообмена")}
          </>
        );
      case 'cylinder_znu_c63':
      case 'cylinder_gru_c70':
        return (
          <>
            {renderPropertyGroupTitle('Геометрические параметры цилиндра')}
            {renderInputField('Диаметр поршня (D)', 'pistonDiameter', 'м', 'number', 'any', { min: 0 }, "Внутренний диаметр гильзы цилиндра")}
            {renderInputField('Диаметр штока (d)', 'rodDiameter', 'м', 'number', 'any', { min: 0 }, "Диаметр штока цилиндра (0, если без штока со стороны слива)")}
            {renderInputField('Ход поршня (S)', 'stroke', 'м', 'number', 'any', { min: 0 }, "Максимальное перемещение поршня")}
            {renderPropertyGroupTitle('Рабочие параметры цилиндра')}
            {renderInputField('Требуемое усилие (F)', 'force', 'Н', 'number', 'any', { min: 0 }, "Усилие, которое должен развить шток цилиндра")}
            {renderPropertyGroupTitle('Эффективность цилиндра')}
            {renderInputField('Мех. КПД (ηгм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 }, "Механический КПД гидроцилиндра (учет трения)")}
            {renderInputField('Объемный КПД (ηоц)', 'volEff', '', 'number', '0.01', { min: 0, max: 1 }, "Объемный КПД гидроцилиндра (учет внутренних перетечек)")}
            {renderPropertyGroupTitle('Тепловые параметры цилиндра')}
            {(selectedModule.properties?.sideSurfaceArea !== undefined) && renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности цилиндра для теплообмена")}
          </>
        );
      case 'distributor_rge100':
      case 'power_block_bpg':
      case 'hydro_block_gbf':
        return (
          <>
            {renderPropertyGroupTitle('Гидравлические параметры')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на компоненте при номинальном расходе")}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Номинальный расход, при котором указан перепад давления")}
            {renderInputField('Внутренние утечки (Qут)', 'internalLeakage', 'л/мин', 'number', 'any', { min: 0 }, "Объем внутренних перетечек в компоненте при номинальном давлении")}
            {renderPropertyGroupTitle('Тепловые параметры')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности компонента для теплообмена")}
          </>
        );
      case 'filter_frc12':
        return (
          <>
            {renderPropertyGroupTitle('Гидравлические параметры фильтра')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на чистом фильтре при номинальном расходе")}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Номинальный расход, для которого указан перепад давления")}
            {renderInputField('Тонкость фильтрации', 'filtrationRate', 'мкм', 'number', 'any', { min: 0 }, "Номинальная тонкость фильтрации")}
            {renderPropertyGroupTitle('Тепловые параметры фильтра')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности фильтра для теплообмена")}
          </>
        );
      case 'pipe':
        return (
          <>
            {renderPropertyGroupTitle('Параметры трубопровода')}
            {renderInputField('Внутр. диаметр (d)', 'diameter', 'м', 'number', '0.00001', { min: 0.001 }, "Внутренний диаметр трубы, метры")}
            {renderInputField('Длина (l)', 'length', 'м', 'number', '0.01', { min: 0 }, "Длина участка трубы, метры")}
            {renderInputField('Абс. шероховатость (Δ)', 'roughness', 'м', 'number', '0.000001', { min: 0 }, "Абсолютная шероховатость внутренней поверхности трубы, метры")}
            {renderInputField('Сумм. коэф. мест. сопротивл. (Σξ)', 'localResistanceCoeff', '', 'number', '0.01', { min: 0 }, "Суммарный коэффициент местных гидравлических сопротивлений для данного участка трубы")}
          </>
        );
      case 'tee_splitter':
        return (
          <>
            {renderPropertyGroupTitle('Параметры тройника')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на тройнике при общем номинальном расходе")}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Общий номинальный расход, для которого указан перепад давления")}
            <p><i>Поток делится поровну между активными выходами.</i></p>
          </>
        );
      case 'collector':
        return (
          <>
            {renderPropertyGroupTitle('Параметры коллектора')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на коллекторе при общем номинальном расходе")}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Общий номинальный расход, для которого указан перепад давления")}
            <p><i>Конфигурация портов: 2 входа (слева), 1 выход (справа).</i></p>
          </>
        );
      default:
        return <p>No specific properties defined for this module.</p>;
    }
  };

  const renderCalculatedParam = (label, value, unit = '', precision = 3) => {
    if (value === undefined || value === null) return null;
    let displayValue = typeof value === 'number' ? value.toFixed(precision) : value;
    return (
      <div className="calculated-param-field">
        <span className="param-label">{label}:</span>
        <span className="param-value">{displayValue} {unit}</span>
      </div>
    );
  };

  return (
    <div className="properties-screen">
      <h2>Свойства: {moduleName}</h2>
      <p className="module-info">(ID экземпляра: {selectedModule.instanceId})</p>
      <p className="module-info">Тип: {selectedModule.type} {selectedModule.system ? `(${selectedModule.system.toUpperCase()})` : ''}</p>
      {renderInputField('Цвет модуля', 'color', '', 'color', undefined, {}, "Выберите цвет для отображения модуля на схеме")}
      <hr />
      <div className="specific-properties">
        {renderProperties()}
      </div>
      {selectedModule.type === 'cylinder' && calculatedCylinderParams && (
        <>
          <hr />
          <div className="calculated-parameters-section">
            {renderPropertyGroupTitle('Расчетные параметры цилиндра')}
            {renderCalculatedParam('Давление в поршневой полости', calculatedCylinderParams.pistonChamberPressureMPa, 'МПа')}
            {renderCalculatedParam('Давление в штоковой полости', calculatedCylinderParams.rodChamberPressureMPa, 'МПа')}
            {renderCalculatedParam('Скорость штока', calculatedCylinderParams.rodSpeedMs, 'м/с', 4)}
            {renderCalculatedParam('Полезная мощность на штоке', calculatedCylinderParams.usefulPowerKw, 'кВт')}
            {renderCalculatedParam('Фактический поток в цилиндр', (calculatedCylinderParams.actualFlowToCylinderM3s * 60000), 'л/мин')}
          </div>
        </>
      )}
      {selectedModule.type === 'cylinder' && !calculatedCylinderParams && detailedResults && (
        <>
          <hr />
          <div className="calculated-parameters-section">
            {renderPropertyGroupTitle('Расчетные параметры цилиндра')}
            <p><em>Расчетные данные для этого цилиндра отсутствуют в текущих результатах.</em></p>
          </div>
        </>
      )}
      <hr />
      <div className="properties-actions">
        <button onClick={handleSave} disabled={!selectedModule}>Сохранить свойства</button>
        {selectedModule && (
          <button onClick={handleDelete} className="delete-button">Удалить модуль</button>
        )}
        {selectedModule && getDefaultProperties && (
          <button onClick={handleResetToDefaults} className="reset-button">Сбросить по умолчанию</button>
        )}
      </div>
    </div>
  );
};
export default PropertiesScreen;