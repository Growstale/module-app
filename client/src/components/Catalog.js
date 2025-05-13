import React from 'react';
import Module from './Module';
import '../styles/Catalog.css';


const Catalog = () => {
    const modules = [
        // Входные/выходные точки системы
        { id: 'engine_d245', name: 'Двигатель (Д245)', type: 'engine_input' }, // Задает входные обороты
        { id: 'tank', name: 'Гидробак', type: 'tank_output' },          // Конечный резервуар
    
        // Насосы из CSV (раздел 1)
        { id: 'pump_gns_ap30', name: 'Насос (AP30)', type: 'pump', system: 'gns' },
        { id: 'pump_gru_nsh10', name: 'Насос (НШ10)', type: 'pump', system: 'gru' },
    
        // Гидроцилиндры из CSV (разделы 4.5, 5, 8)
        { id: 'cylinder_znu_c63', name: 'Цилиндр ЗНУ (Ц63)', type: 'cylinder', system: 'gns' },
        { id: 'cylinder_gru_c70', name: 'Цилиндр ГРУ (Ц70)', type: 'cylinder', system: 'gru' }, // Ц70 из раздела 8.1
    
        // Агрегаты из CSV (раздел 4.5)
        { id: 'distributor_rge100', name: 'Распределитель (RGE100)', type: 'distributor', system: 'gns' },
        { id: 'power_block_bpg', name: 'Блок питания (BPG)', type: 'block', system: 'gns' }, // Уточнить функцию, пока просто "block"
        { id: 'hydro_block_gbf', name: 'Гидроблок (ГБФ)', type: 'block', system: 'gru' },   // Уточнить функцию, пока просто "block"
        { id: 'filter_frc12', name: 'Фильтр сливной (FRC12)', type: 'filter', system: 'common' }, // Общий?
    
        { id: 'pipe', name: 'Трубопровод', type: 'pipe', system: 'common' }, // Общий тип трубы

        { id: 'tee_splitter', name: 'Тройник', type: 'splitter', system: 'common' }

      ];
        return (
        <div className="catalog">
            <h2>Catalog</h2>
            <div className="module-list">
               {modules.map((module) => (
                   <Module key={module.id} module={module} />
               ))}
            </div>
        </div>
    );
};

export default Catalog;