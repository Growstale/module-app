import React from 'react';
import Module from './Module';
import '../styles/Catalog.css';


const Catalog = () => {
    const modules = [
        { id: 'start', name: 'Start Node', type: 'start' }, 
        { id: 'end', name: 'End Node', type: 'end' },    
        { id: 1, name: 'ADD', type: 'regular' },    
        { id: 2, name: 'MULTIPLY', type: 'regular' },
        { id: 3, name: 'SQUARE', type: 'regular' },
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