import React, { useState, useEffect } from 'react';
import '../styles/PropertiesScreen.css';

const PropertiesScreen = ({ selectedModule, updateModuleProperties }) => {

    const [color, setColor] = useState('');
    const [size, setSize] = useState('');

    useEffect(() => {  //Следим за selectedModule
        if(selectedModule) {
          setColor(selectedModule.properties.color);
          setSize(selectedModule.properties.size);
        }
    }, [selectedModule]); //  Срабатывает при изменении selectedModule

    const handleColorChange = (e) => {
        setColor(e.target.value);
    };

    const handleSizeChange = (e) => {
        setSize(e.target.value);
    };

     const handleSave = () => {
        if(selectedModule) {
          updateModuleProperties(selectedModule.instanceId, { color, size });
        }
    };


    if (!selectedModule) {
        return <div className="properties-screen">Select a module</div>;
    }


    return (
        <div className="properties-screen">
            <h2>Properties</h2>
            <p>Module: {selectedModule.name} (ID: {selectedModule.instanceId})</p>
           <div>
               <label>Color:</label>
               <input type="color" value={color} onChange={handleColorChange} />
            </div>
            <div>
              <label>Size:</label>
                <select value={size} onChange={handleSizeChange}>
                  <option value="small">Small</option>
                   <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
            </div>
          <button onClick={handleSave}>Save</button>
        </div>
    );
};

export default PropertiesScreen;