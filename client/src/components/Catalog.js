import React from 'react';
import Module from './Module';
import '../styles/Catalog.css';


const Catalog = () => {
    const modules = [ //Примерный список модулей. ID важен.
        { id: 1, name: 'Module A' },
        { id: 2, name: 'Module B' },
        { id: 3, name: 'Module C' },
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