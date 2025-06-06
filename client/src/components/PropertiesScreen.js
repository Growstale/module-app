import React, { useState, useEffect } from 'react';
import '../styles/PropertiesScreen.css';

const PropertiesScreen = ({ selectedModule, updateModuleProperties, onDeleteModule, detailedResults, getDefaultProperties }) => {
  const [properties, setProperties] = useState({}); // объект, хранящий копию свойств выбранного модуля
  const [moduleName, setModuleName] = useState(''); // имя выбранного модуля для отображения в заголовке
  const [calculatedCylinderParams, setCalculatedCylinderParams] = useState(null);
  const [calculatedMotorParams, setCalculatedMotorParams] = useState(null);
  const [pipeCalcInputs, setPipeCalcInputs] = useState({ flowLpm: 10, velocityMs: 1.5 }); // Входные данные для калькулятора рекомендуемого диаметра трубы
  const [calculatedPipeDiameter, setCalculatedPipeDiameter] = useState(null); // Результат расчета калькулятора диаметра трубы
  const [cylinderCalcInputs, setCylinderCalcInputs] = useState({ forceN: 10000, pressureMPa: 10, mechEff: 0.95 }); // Входные данные для калькулятора рекомендуемого диаметра поршня цилиндра
  const [calculatedCylinderDiameter, setCalculatedCylinderDiameter] = useState(null); // Результат расчета калькулятора диаметра поршня
  const [pumpCalcInputs, setPumpCalcInputs] = useState({ flowLpm: 50, rpm: 1500, volEff: 0.92 }); // Входные данные для калькулятора рекомендуемого рабочего объема насоса
  const [calculatedPumpVolume, setCalculatedPumpVolume] = useState(null); // Результат расчета калькулятора рабочего объема насоса

  /* 
  эффект срабатывает каждый раз, когда изменяется selectedModule (выбран новый модуль) 
  или detailedResults (пришли новые результаты расчета)
  */
  useEffect(() => {
    if (selectedModule) {
      setProperties(selectedModule.properties || {});
      setModuleName(selectedModule.name || '');
      
      // Сброс калькуляторов, если выбран не тот тип модуля
      if (selectedModule.type !== 'pipe') {
        setCalculatedPipeDiameter(null);
      }
      if (selectedModule.type !== 'cylinder') {
        setCalculatedCylinderDiameter(null);
      }
      if (selectedModule.type !== 'pump') {
        setCalculatedPumpVolume(null);
      }
      
      let foundCylParams = null;
      let foundMotParams = null;

      if (detailedResults) {
        for (const systemKey in detailedResults) {
          const systemData = detailedResults[systemKey];
          if (systemData.branches) {
            for (const branchKey in systemData.branches) {
              const branchData = systemData.branches[branchKey];
              if (
                selectedModule.type === 'cylinder' &&
                branchData.cylinderCalculatedParams &&
                String(branchData.cylinderCalculatedParams.cylinderInstanceId) === String(selectedModule.instanceId)
              ) {
                foundCylParams = branchData.cylinderCalculatedParams;
                break;
              }
              if (
                selectedModule.type === 'motor' &&
                branchData.motorCalculatedParams &&
                String(branchData.motorCalculatedParams.motorInstanceId) === String(selectedModule.instanceId)
              ) {
                foundMotParams = branchData.motorCalculatedParams;
                break;
              }
            }
          }
          if (foundCylParams || foundMotParams) break;
        }
      }
      setCalculatedCylinderParams(foundCylParams);
      setCalculatedMotorParams(foundMotParams);

    } else {
      setProperties({});
      setModuleName('');
      setCalculatedCylinderParams(null);
      setCalculatedMotorParams(null);

      setCalculatedPipeDiameter(null);
      setCalculatedCylinderDiameter(null);
      setCalculatedPumpVolume(null);

    }
  }, [selectedModule, detailedResults]);

  const handleCylinderCalcInputChange = (e) => {
    const { name, value } = e.target;
    setCylinderCalcInputs(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handlePumpCalcInputChange = (e) => {
    const { name, value } = e.target;
    setPumpCalcInputs(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handlePipeCalcInputChange = (e) => {
    const { name, value } = e.target;
    setPipeCalcInputs(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  // Рассчитывает рекомендуемый рабочий объем насоса (см³/об) по формуле: (flowLpm * 1000) / (rpm * volEff)
  const calculateRecommendedPumpVolume = () => {
    if (pumpCalcInputs.rpm <= 0 || pumpCalcInputs.volEff <= 0 || pumpCalcInputs.flowLpm <= 0) {
        alert("Расход, обороты и объемный КПД должны быть больше нуля.");
        setCalculatedPumpVolume(null);
        return;
    }
    const workingVolumeCm3 = (pumpCalcInputs.flowLpm * 1000) / (pumpCalcInputs.rpm * pumpCalcInputs.volEff);
    setCalculatedPumpVolume(workingVolumeCm3.toFixed(1));
  };
  
  // Рассчитывает рекомендуемый диаметр поршня цилиндра (мм) по формуле для площади круга, исходя из усилия и давления: диаметр = sqrt((4 * ЭффективноеУсилие) / (PI * ДавлениеВПаскалях)). Эффективное усилие учитывает механический КПД
  const calculateRecommendedCylinderDiameter = () => {
    if (cylinderCalcInputs.pressureMPa <= 0 || cylinderCalcInputs.mechEff <= 0 || cylinderCalcInputs.forceN <= 0) {
        alert("Усилие, давление и КПД должны быть больше нуля.");
        setCalculatedCylinderDiameter(null);
        return;
    }
    const pressurePa = cylinderCalcInputs.pressureMPa * 1000000;
    const effectiveForceN = cylinderCalcInputs.forceN / cylinderCalcInputs.mechEff;
    const diameterM = Math.sqrt((4 * effectiveForceN) / (Math.PI * pressurePa));
    const diameterMm = diameterM * 1000;
    setCalculatedCylinderDiameter(diameterMm.toFixed(1)); // 1 знак после запятой для мм
  };

  // Рассчитывает рекомендуемый внутренний диаметр трубы (мм) по формуле: диаметр = sqrt((4 * ПотокВ_м3/с) / (PI * Скорость))
  const calculateRecommendedPipeDiameter = () => {
    if (pipeCalcInputs.velocityMs <= 0) {
        alert("Скорость должна быть больше нуля.");
        setCalculatedPipeDiameter(null);
        return;
    }
    if (pipeCalcInputs.flowLpm <= 0) {
        alert("Расход должен быть больше нуля.");
        setCalculatedPipeDiameter(null);
        return;
    }
    const flowM3s = pipeCalcInputs.flowLpm / 60000;
    const diameterM = Math.sqrt((4 * flowM3s) / (Math.PI * pipeCalcInputs.velocityMs));
    const diameterMm = diameterM * 1000;
    setCalculatedPipeDiameter(diameterMm.toFixed(2));
  };

  // Обрабатывает изменения в полях свойств основного модуля
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
          'roughness', 'localResistanceCoeff', 'nominalPressureMPa',
          'requiredTorque', 
          'nominalRpm', 
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
      if (window.confirm(`Are you sure you want to delete the module "${moduleName}"? This action cannot be undone.`)) {
        onDeleteModule(selectedModule.instanceId);
      }
    }
  };

  const handleResetToDefaults = () => {
    if (selectedModule && getDefaultProperties) {
      const defaultProps = getDefaultProperties(selectedModule);
      setProperties(defaultProps);
      if (selectedModule.type === 'pipe') {
        setCalculatedPipeDiameter(null);
      }
    }
  };

  // Универсальная функция для рендеринга поля ввода свойства
  const renderInputField = (
      label,
      name,
      unit = '',
      type = 'number',
      step = 'any',
      inputProps = {}, 
      tooltipText = '',
      valueSource, 
      onChangeCallback 
  ) => (
    <div key={`${name}-${label}`} className="property-field" title={tooltipText || label}> {/* Добавил label в key для большей уникальности */}
        <label htmlFor={`prop-${name}-${label}`}>{label}:</label>
        <div className="input-wrapper">
            <input
                type={type}
                id={`prop-${name}-${label}`}
                name={name}
                value={valueSource[name] ?? (type === 'number' ? 0 : (type === 'color' ? '#9e9e9e' : ''))}
                onChange={onChangeCallback} 
                step={step}
                {...inputProps}
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
    const moduleIdForSwitch = selectedModule.id || selectedModule.type;

    switch (moduleIdForSwitch) {
      case 'engine_d245':
        return (
          <>
            {renderPropertyGroupTitle('Параметры двигателя')}
            {renderInputField('Обороты ХХ (Nхх)', 'idleRpm', 'об/мин', 'number', 'any', { min: 0 }, "Обороты холостого хода двигателя", properties, handlePropertyChange)}
            {renderInputField('Ном. обороты (Nном)', 'nominalRpm', 'об/мин', 'number', 'any', { min: 0 }, "Номинальные обороты двигателя", properties, handlePropertyChange)}
            {renderInputField('Обороты макс. момента (Nmax)', 'maxTorqueRpm', 'об/мин', 'number', 'any', { min: 0 }, "Обороты двигателя при максимальном крутящем моменте", properties, handlePropertyChange)}
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
            {renderInputField('Длина (L)', 'length', 'м', 'number', 'any', { min: 0 }, "Длина гидробака", properties, handlePropertyChange)}
            {renderInputField('Ширина (S)', 'width', 'м', 'number', 'any', { min: 0 }, "Ширина гидробака", properties, handlePropertyChange)}
            {renderInputField('Высота (H)', 'height', 'м', 'number', 'any', { min: 0 }, "Общая высота гидробака", properties, handlePropertyChange)}
          </>
        );
      case 'pump_gns_ap30':
      case 'pump_gru_nsh10':
        return (
          <>
            {renderPropertyGroupTitle('Основные параметры насоса')}
            {renderInputField('Рабочий объем (Vн)', 'workingVolume', 'см³/об', 'number', 'any', { min: 0 }, "Объем жидкости, вытесняемый насосом за один оборот", properties, handlePropertyChange)}
            {renderInputField('Передаточное число (i)', 'driveRatio', '', 'number', 'any', { min: 0 }, "Передаточное число привода насоса от двигателя", properties, handlePropertyChange)}
            {renderInputField('Номинальное давление', 'nominalPressureMPa', 'МПа', 'number', 'any', { min: 0 }, "Номинальное рабочее давление насоса (для справки)", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Эффективность насоса')}
            {renderInputField('Объемный КПД (ηv)', 'volumetricEff', '', 'number', '0.01', { min: 0, max: 1 }, "Объемный коэффициент полезного действия", properties, handlePropertyChange)}
            {renderInputField('Мех. КПД (ηм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 }, "Механический коэффициент полезного действия", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Тепловые параметры насоса')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь боковой поверхности насоса для теплообмена", properties, handlePropertyChange)}
            <hr/>
            {renderPropertyGroupTitle('Вспомогательный расчет рабочего объема')}
            {renderInputField('Требуемая подача (Q)', 'flowLpm', 'л/мин', 'number', 'any', {}, "Желаемая подача насоса", pumpCalcInputs, handlePumpCalcInputChange)}
            {renderInputField('Частота вращения (n)', 'rpm', 'об/мин', 'number', 'any', {min:1}, "Предполагаемые обороты вала насоса", pumpCalcInputs, handlePumpCalcInputChange)}
            {renderInputField('Объемный КПД насоса', 'volEff', '', 'number', '0.01', {min:0.1, max:1}, "Ожидаемый объемный КПД", pumpCalcInputs, handlePumpCalcInputChange)}
            <button onClick={calculateRecommendedPumpVolume} style={{marginTop: '10px', marginBottom: '10px', padding: '8px 12px'}} className="action-button">
              Рассчитать рабочий объем
            </button>
            {calculatedPumpVolume !== null && (
                <div className="calculated-param-field" style={{paddingLeft: 0, marginTop: '5px'}}>
                  <span className="param-label">Рекомендуемый рабочий объем:</span>
                  <span className="param-value"><strong>{calculatedPumpVolume} см³/об</strong></span>
                </div>
            )}
            <hr/>
          </>
        );
      case 'cylinder_znu_c63':
      case 'cylinder_gru_c70':
        return (
          <>
            {renderPropertyGroupTitle('Геометрические параметры цилиндра')}
            {renderInputField('Диаметр поршня (D)', 'pistonDiameter', 'м', 'number', 'any', { min: 0 }, "Внутренний диаметр гильзы цилиндра", properties, handlePropertyChange)}
            {renderInputField('Диаметр штока (d)', 'rodDiameter', 'м', 'number', 'any', { min: 0 }, "Диаметр штока цилиндра (0, если без штока со стороны слива)", properties, handlePropertyChange)}
            {renderInputField('Ход поршня (S)', 'stroke', 'м', 'number', 'any', { min: 0 }, "Максимальное перемещение поршня", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Рабочие параметры цилиндра')}
            {renderInputField('Требуемое усилие (F)', 'force', 'Н', 'number', 'any', { min: 0 }, "Усилие, которое должен развить шток цилиндра", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Эффективность цилиндра')}
            {renderInputField('Мех. КПД (ηгм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 }, "Механический КПД гидроцилиндра (учет трения)", properties, handlePropertyChange)}
            {renderInputField('Объемный КПД (ηоц)', 'volEff', '', 'number', '0.01', { min: 0, max: 1 }, "Объемный КПД гидроцилиндра (учет внутренних перетечек)", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Тепловые параметры цилиндра')}
            {(selectedModule.properties?.sideSurfaceArea !== undefined) && renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности цилиндра для теплообмена", properties, handlePropertyChange)}
            <hr/>
            {renderPropertyGroupTitle('Вспомогательный расчет диаметра поршня')}
            {renderInputField('Полезное усилие (F)', 'forceN', 'Н', 'number', 'any', {}, "Желаемое усилие на штоке", cylinderCalcInputs, handleCylinderCalcInputChange)}
            {renderInputField('Рабочее давление (Pраб)', 'pressureMPa', 'МПа', 'number', '0.1', {min:0.1}, "Ожидаемое давление в поршневой полости", cylinderCalcInputs, handleCylinderCalcInputChange)}
            {renderInputField('Мех. КПД цилиндра', 'mechEff', '', 'number', '0.01', {min:0.1, max:1}, "Учитывает трение в цилиндре", cylinderCalcInputs, handleCylinderCalcInputChange)}
            <button onClick={calculateRecommendedCylinderDiameter} style={{marginTop: '10px', marginBottom: '10px', padding: '8px 12px'}} className="action-button">
              Рассчитать диаметр поршня
            </button>
            {calculatedCylinderDiameter !== null && (
                <div className="calculated-param-field" style={{paddingLeft: 0, marginTop: '5px'}}>
                  <span className="param-label">Рекомендуемый диаметр поршня:</span>
                  <span className="param-value"><strong>{calculatedCylinderDiameter} мм</strong></span>
                </div>
            )}
            <hr/>
          </>
        );
      case 'hydromotor_basic':
        return (
            <>
                {renderPropertyGroupTitle('Основные параметры гидромотора')}
                {renderInputField('Рабочий объем (Vм)', 'workingVolume', 'см³/об', 'number', 'any', { min: 0 }, "Объем жидкости, потребляемый мотором за один оборот", properties, handlePropertyChange)}
                {renderInputField('Требуемый момент на валу (Mтр)', 'requiredTorque', 'Нм', 'number', 'any', { min: 0 }, "Момент, который должен развить вал гидромотора", properties, handlePropertyChange)}
                {renderInputField('Номинальное давление', 'nominalPressureMPa', 'МПа', 'number', 'any', { min: 0 }, "Номинальное рабочее давление (справочно)", properties, handlePropertyChange)}
                {renderInputField('Номинальные обороты', 'nominalRpm', 'об/мин', 'number', 'any', { min: 0 }, "Номинальная частота вращения (справочно)", properties, handlePropertyChange)}
                {renderPropertyGroupTitle('Эффективность гидромотора')}
                {renderInputField('Мех. КПД (ηмм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 }, "Механический КПД гидромотора", properties, handlePropertyChange)}
                {renderInputField('Объемный КПД (ηом)', 'volEff', '', 'number', '0.01', { min: 0, max: 1 }, "Объемный КПД гидромотора (учет утечек)", properties, handlePropertyChange)}
                {renderPropertyGroupTitle('Тепловые параметры гидромотора')}
                {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности мотора для теплообмена", properties, handlePropertyChange)}
            </>
        );
      case 'distributor_rge100':
      case 'power_block_bpg':
      case 'hydro_block_gbf':
        return (
          <>
            {renderPropertyGroupTitle('Гидравлические параметры')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на компоненте при номинальном расходе", properties, handlePropertyChange)}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Номинальный расход, при котором указан перепад давления", properties, handlePropertyChange)}
            {renderInputField('Внутренние утечки (Qут)', 'internalLeakage', 'л/мин', 'number', 'any', { min: 0 }, "Объем внутренних перетечек в компоненте при номинальном давлении", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Тепловые параметры')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности компонента для теплообмена", properties, handlePropertyChange)}
          </>
        );
      case 'filter_frc12':
        return (
          <>
            {renderPropertyGroupTitle('Гидравлические параметры фильтра')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на чистом фильтре при номинальном расходе", properties, handlePropertyChange)}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Номинальный расход, для которого указан перепад давления", properties, handlePropertyChange)}
            {renderInputField('Тонкость фильтрации', 'filtrationRate', 'мкм', 'number', 'any', { min: 0 }, "Номинальная тонкость фильтрации", properties, handlePropertyChange)}
            {renderPropertyGroupTitle('Тепловые параметры фильтра')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²', 'number', 'any', { min: 0 }, "Площадь поверхности фильтра для теплообмена", properties, handlePropertyChange)}
          </>
        );
      case 'pipe':
        return (
          <>
            {renderPropertyGroupTitle('Параметры трубопровода (редактируемые)')}
            {renderInputField('Внутр. диаметр (d)', 'diameter', 'м', 'number', '0.00001', { min: 0.001 }, "Внутренний диаметр трубы, метры", properties, handlePropertyChange)}
            {renderInputField('Длина (l)', 'length', 'м', 'number', '0.01', { min: 0 }, "Длина участка трубы, метры", properties, handlePropertyChange)}
            {renderInputField('Абс. шероховатость (Δ)', 'roughness', 'м', 'number', '0.000001', { min: 0 }, "Абсолютная шероховатость внутренней поверхности трубы, метры", properties, handlePropertyChange)}
            {renderInputField('Сумм. коэф. мест. сопротивл. (Σξ)', 'localResistanceCoeff', '', 'number', '0.01', { min: 0 }, "Суммарный коэффициент местных гидравлических сопротивлений для данного участка трубы", properties, handlePropertyChange)}
            
            <hr/> 

            {renderPropertyGroupTitle('Вспомогательный расчет рекомендуемого диаметра')}
            {renderInputField(
              'Расчетный Расход (Q)',
              'flowLpm',              
              'л/мин',               
              'number',              
              'any',                 
              {},                    
              "Введите предполагаемый расход жидкости через трубу",
              pipeCalcInputs,        
              handlePipeCalcInputChange 
            )}
            {renderInputField(
              'Желаемая скорость (V)',
              'velocityMs',          
              'м/с',                 
              'number',              
              '0.1',                 
              { min: 0.01 }, 
              "Введите желаемую скорость потока в трубе (например, 1-1.5 для всас., 3-5 для напорных)",
              pipeCalcInputs,        
              handlePipeCalcInputChange
            )}
            <button 
              onClick={calculateRecommendedPipeDiameter} 
              style={{marginTop: '10px', marginBottom: '10px', padding: '8px 12px'}}
              className="action-button" 
            >
              Рассчитать рекомендуемый диаметр
            </button>
            {calculatedPipeDiameter !== null && (
                <div className="calculated-param-field" style={{paddingLeft: 0, marginTop: '5px'}}>
                   <span className="param-label">Рекомендуемый внутренний диаметр:</span>
                   <span className="param-value"><strong>{calculatedPipeDiameter} мм</strong></span>
                </div>
            )}
            <hr/> 
          </>
        );
      case 'tee_splitter':
        return (
          <>
            {renderPropertyGroupTitle('Параметры тройника')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на тройнике при общем номинальном расходе", properties, handlePropertyChange)}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Общий номинальный расход, для которого указан перепад давления", properties, handlePropertyChange)}
            <p><i>Поток делится поровну между активными выходами.</i></p>
          </>
        );
      case 'collector':
        return (
          <>
            {renderPropertyGroupTitle('Параметры коллектора')}
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа', 'number', 'any', { min: 0 }, "Номинальный перепад давления на коллекторе при общем номинальном расходе", properties, handlePropertyChange)}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин', 'number', 'any', { min: 0 }, "Общий номинальный расход, для которого указан перепад давления", properties, handlePropertyChange)}
            <p><i>Конфигурация портов: 2 входа (слева), 1 выход (справа).</i></p>
          </>
        );
      default:
        return <p>No specific properties defined for this module type: {selectedModule.type} (ID: {selectedModule.id}).</p>;
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
      {selectedModule.type === 'motor' && calculatedMotorParams && (
        <>
          <hr />
          <div className="calculated-parameters-section">
            {renderPropertyGroupTitle('Расчетные параметры гидромотора')}
            {renderCalculatedParam('Перепад давления на моторе', calculatedMotorParams.pressureDropMPa, 'МПа')}
            {renderCalculatedParam('Частота вращения вала', calculatedMotorParams.rpm, 'об/мин', 1)}
            {renderCalculatedParam('Полезная мощность на валу', calculatedMotorParams.usefulPowerKw, 'кВт')}
            {renderCalculatedParam('Фактический поток через мотор', (calculatedMotorParams.actualFlowToMotorM3s * 60000), 'л/мин')}
          </div>
        </>
      )}
      {selectedModule.type === 'motor' && !calculatedMotorParams && detailedResults && (
         <>
            <hr />
            <div className="calculated-parameters-section">
                {renderPropertyGroupTitle('Расчетные параметры гидромотора')}
                <p><em>Расчетные данные для этого гидромотора отсутствуют в текущих результатах.</em></p>
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