import React from 'react';
import Module from './Module';
import '../styles/Catalog.css';

const Catalog = () => {
    const modules = [
        { id: 'engine_d245', name: 'Двигатель (Д245)', type: 'engine_input' },
        { id: 'tank', name: 'Гидробак', type: 'tank_output' },
        { id: 'pump_gns_ap30', name: 'Насос (AP30)', type: 'pump', system: 'gns' },
        { id: 'pump_gru_nsh10', name: 'Насос (НШ10)', type: 'pump', system: 'gru' },
        { id: 'cylinder_znu_c63', name: 'Цилиндр ЗНУ (Ц63)', type: 'cylinder', system: 'gns' },
        { id: 'cylinder_gru_c70', name: 'Цилиндр ГРУ (Ц70)', type: 'cylinder', system: 'gru' },
        { id: 'distributor_rge100', name: 'Распределитель (RGE100)', type: 'distributor', system: 'gns' },
        { id: 'power_block_bpg', name: 'Блок питания (BPG)', type: 'block', system: 'gns' },
        { id: 'hydro_block_gbf', name: 'Гидроблок (ГБФ)', type: 'block', system: 'gru' },
        { id: 'filter_frc12', name: 'Фильтр сливной (FRC12)', type: 'filter', system: 'common' },
        { id: 'pipe', name: 'Трубопровод', type: 'pipe', system: 'common' },
        { id: 'tee_splitter', name: 'Тройник', type: 'splitter', system: 'common' },
        { id: 'collector', name: 'Смеситель (2->1)', type: 'collector', system: 'common' }
    ];

    return (
        <div className="catalog">
            <div className="module-list">
                {modules.map((module) => (
                    <Module key={module.id} module={module} />
                ))}
            </div>
        </div>
    );
};

export default Catalog;