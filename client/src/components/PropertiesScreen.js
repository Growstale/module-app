// PropertiesScreen.js
import React, { useState, useEffect } from 'react';
import '../styles/PropertiesScreen.css'; // Убедитесь, что стили подключены

const PropertiesScreen = ({ selectedModule, updateModuleProperties, onDeleteModule }) => {
  const [properties, setProperties] = useState({});
  const [moduleName, setModuleName] = useState(''); // Для отображения имени

  // Обновляем локальное состояние при изменении выбранного модуля
  useEffect(() => {
    if (selectedModule) {
      setProperties(selectedModule.properties || {});
      setModuleName(selectedModule.name || '');
    } else {
      // Сбрасываем при отсутствии выбранного модуля
      setProperties({});
      setModuleName('');
    }
  }, [selectedModule]);

  // Обработчик изменений в полях ввода
  const handlePropertyChange = (e) => {
    const { name, value, type, checked } = e.target;
    let processedValue;

    if (type === 'number') {
      // Преобразуем в число, обрабатываем пустую строку как 0
      processedValue = parseFloat(value) || 0;
    } else if (type === 'checkbox') {
      processedValue = checked;
    } else { // Для text, color, radio и др.
      processedValue = value;
    }

    // Обновляем локальное состояние свойств
    setProperties(prevProps => ({
      ...prevProps,
      [name]: processedValue
    }));
  };

  // Сохранение изменений
  const handleSave = () => {
    if (selectedModule) {
      updateModuleProperties(selectedModule.instanceId, properties);
      alert(`Properties for "${moduleName}" saved!`); // Уведомление пользователю
    }
  };

  // Удаление модуля
  const handleDelete = () => {
    if (selectedModule && onDeleteModule) {
      if (window.confirm(`Are you sure you want to delete the module "${moduleName}"? This action cannot be undone.`)) {
        onDeleteModule(selectedModule.instanceId);
      }
    }
  };

  // --- Вспомогательная функция для рендеринга полей ввода ---
  const renderInputField = (label, name, unit = '', type = 'number', step = 'any', props = {}) => (
    <div key={name} className="property-field">
      <label htmlFor={`prop-${name}`}>{label}:</label>
      <div className="input-wrapper">
        <input
          type={type}
          id={`prop-${name}`}
          name={name}
          // Используем ?? для обработки null/undefined, устанавливаем дефолтное значение
          value={properties[name] ?? (type === 'number' ? 0 : (type === 'color' ? '#9e9e9e' : ''))}
          onChange={handlePropertyChange}
          step={step}
          {...props} // Дополнительные атрибуты (min, max и т.д.)
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );

   // --- Вспомогательная функция для радиокнопок ---
  const renderRadioGroup = (groupLabel, name, options) => (
      <div key={name} className="property-field radio-group">
          <label className="group-label">{groupLabel}:</label>
          <div className="radio-options">
              {options.map(opt => (
                  <label key={opt.value} htmlFor={`prop-${name}-${opt.value}`}>
                      <input
                          type="radio"
                          id={`prop-${name}-${opt.value}`}
                          name={name}
                          value={opt.value}
                          // Проверяем, соответствует ли текущее значение свойству
                          checked={properties[name] === opt.value}
                          onChange={handlePropertyChange}
                      />
                      {opt.label}
                  </label>
              ))}
          </div>
      </div>
  );


  // Если модуль не выбран, показываем заглушку
  if (!selectedModule) {
    return <div className="properties-screen">Select a module to configure</div>;
  }

  // --- Функция для рендеринга набора свойств в зависимости от ID модуля ---
  const renderProperties = () => {
    switch (selectedModule.id) {
      case 'engine_d245':
        return (
          <>
            {renderInputField('Обороты ХХ (Nхх)', 'idleRpm', 'об/мин')}
            {renderInputField('Ном. обороты (Nном)', 'nominalRpm', 'об/мин')}
            {renderInputField('Обороты макс. момента (Nmax)', 'maxTorqueRpm', 'об/мин')}
            {renderRadioGroup('Режим для расчета', 'selectedRpmMode', [
                { value: 'idleRpm', label: 'ХХ' },
                { value: 'nominalRpm', label: 'Ном.' },
                { value: 'maxTorqueRpm', label: 'Макс. момент' }
            ])}
          </>
        );
      case 'tank':
        return (
          <>
            {renderInputField('Длина (L)', 'length', 'м')}
            {renderInputField('Ширина (S)', 'width', 'м')}
            {renderInputField('Высота (H)', 'height', 'м')}
          </>
        );
      case 'pump_gns_ap30':
      case 'pump_gru_nsh10':
        return (
          <>
            {renderInputField('Рабочий объем (Vн)', 'workingVolume', 'см³/об')}
            {renderInputField('Объемный КПД (ηv)', 'volumetricEff', '', 'number', '0.01', { min: 0, max: 1 })}
            {renderInputField('Мех. КПД (ηм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 })}
            {renderInputField('Передаточное число (i)', 'driveRatio', '')}
            {renderInputField('Площадь пов. (тепло), м²', 'sideSurfaceArea', 'м²')}
          </>
        );
      case 'cylinder_znu_c63':
      case 'cylinder_gru_c70':
         return (
          <>
            {renderInputField('Диаметр поршня (D)', 'pistonDiameter', 'м')}
            {renderInputField('Диаметр штока (d)', 'rodDiameter', 'м')}
            {renderInputField('Ход поршня (S)', 'stroke', 'м')}
            {renderInputField('Требуемое усилие (F)', 'force', 'Н')}
            {renderInputField('Мех. КПД (ηгм)', 'mechEff', '', 'number', '0.01', { min: 0, max: 1 })}
            {renderInputField('Объемный КПД (ηоц)', 'volEff', '', 'number', '0.01', { min: 0, max: 1 })}
            {/* Площадь показываем только если она задана */}
            {(selectedModule.properties?.sideSurfaceArea !== undefined) && renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²')}
          </>
        );
       // Комбинируем рендеринг для схожих блоков
       case 'distributor_rge100':
       case 'power_block_bpg':
       case 'hydro_block_gbf':
         return (
          <>
            {renderInputField('Перепад давления (ΔРа)', 'pressureDrop', 'МПа')}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин')}
            {renderInputField('Внутренние утечки (Qут)', 'internalLeakage', 'л/мин', 'any', { min: 0 })}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²')}
          </>
        );
      case 'filter_frc12':
         return (
          <>
            {renderInputField('Перепад давления (ΔРа)', 'pressureDrop', 'МПа')}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин')}
            {renderInputField('Площадь пов. (тепло)', 'sideSurfaceArea', 'м²')}
            {renderInputField('Тонкость фильтрации', 'filtrationRate', 'мкм')}
          </>
        );
        case 'pipe':
            return (
              <>
                {renderInputField('Внутр. диаметр (d)', 'diameter', 'м', 'number', '0.001')}
                {renderInputField('Длина (l)', 'length', 'м')}
                {renderInputField('Шероховатость (Δ)', 'roughness', 'м', 'number', '0.00001')}
                {renderInputField('Коэф. мест. сопротивл. (ξ)', 'localResistanceCoeff', '', 'number', '0.1')}
              </>
            );    
              case 'tee_splitter':
        return (
          <>
            {renderInputField('Перепад давления (ΔРа ном.)', 'pressureDrop', 'МПа')}
            {renderInputField('Номинальный расход (Qном.)', 'nominalFlowLmin', 'л/мин')}
            {/* Можно добавить поля для указания, сколько выходов активно, но это усложнит */}
            <p>Конфигурация портов определяется соединениями.</p>
          </>
        );
      default:
        // Если тип модуля неизвестен или для него нет специфичных свойств
        return <p>No specific properties defined for this module.</p>;
    }
  };

  // --- Основной рендер компонента ---
  return (
    <div className="properties-screen">
      <h2>Properties: {moduleName}</h2>
      <p className="module-info">(ID: {selectedModule.instanceId})</p>
      <p className="module-info">Type: {selectedModule.type} {selectedModule.system ? `(${selectedModule.system.toUpperCase()})` : ''}</p>

      {/* Общее свойство - Цвет */}
      {renderInputField('Цвет модуля', 'color', '', 'color')}

      <hr />

      {/* Рендеринг специфичных для модуля свойств */}
      <div className="specific-properties">
         {renderProperties()}
      </div>


      <hr />

      {/* Кнопки действий */}
      <div className="properties-actions">
        <button onClick={handleSave} disabled={!selectedModule}>Save Properties</button>
        <button
          onClick={handleDelete}
          disabled={!selectedModule}
          className="delete-button"
        >
          Delete Module
        </button>
      </div>

    </div>
  );
};

export default PropertiesScreen;