// PropertiesScreen.js
import React, { useState, useEffect } from 'react';
import '../styles/PropertiesScreen.css';

const PropertiesScreen = ({ selectedModule, updateModuleProperties, onDeleteModule }) => {
    const [properties, setProperties] = useState({});

    useEffect(() => {
        if (selectedModule && selectedModule.properties) {
            setProperties(selectedModule.properties);
        } else {
            setProperties({});
        }
    }, [selectedModule]); 

    const handlePropertyChange = (e) => {
        const { name, value, type } = e.target;
        const processedValue = type === 'number' ? parseFloat(value) || 0 : value;

        setProperties(prevProps => ({
            ...prevProps,
            [name]: processedValue
        }));
    };

    const handleSave = () => {
        if (selectedModule) {
            updateModuleProperties(selectedModule.instanceId, properties);
        }
    };

    const handleDelete = () => {
        if (selectedModule && onDeleteModule) {
            if (window.confirm(`Are you sure you want to delete the module "${selectedModule.name}"? This action cannot be undone.`)) {
                onDeleteModule(selectedModule.instanceId);
            }
        }
    };

    if (!selectedModule) {
        return <div className="properties-screen">Select a module to configure</div>;
    }

    return (
        <div className="properties-screen">
            <h2>Properties: {selectedModule.name}</h2>
            <p>(ID: {selectedModule.instanceId})</p>

            <div>
               <label htmlFor="prop-color">Color:</label>
               <input
                  type="color"
                  id="prop-color"
                  name="color" 
                  value={properties.color || '#ffffff'} 
                  onChange={handlePropertyChange}
               />
            </div>       

            <hr />

            {selectedModule.type === 'start' && (
                <div>
                    <label htmlFor="prop-startValue">Start Value:</label>
                    <input
                        type="number"
                        id="prop-startValue"
                        name="startValue"
                        value={properties.startValue ?? 0} 
                        onChange={handlePropertyChange}
                        step="any"
                    />
                </div>
            )}

            {selectedModule.id === 1 && ( 
                <div>
                    <label htmlFor="prop-valueToAdd">Value to Add:</label>
                    <input
                        type="number"
                        id="prop-valueToAdd"
                        name="valueToAdd" 
                        value={properties.valueToAdd ?? 0}
                        onChange={handlePropertyChange}
                        step="any"
                    />
                </div>
            )}

            {selectedModule.id === 2 && ( 
                <div>
                    <label htmlFor="prop-factor">Multiply Factor:</label>
                    <input
                        type="number"
                        id="prop-factor"
                        name="factor" 
                        value={properties.factor ?? 1} 
                        onChange={handlePropertyChange}
                        step="any"
                    />
                </div>
            )}

             {selectedModule.type === 'end' && (
                <p>No specific numeric properties</p>
             )}


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