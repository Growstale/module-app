
import React, { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Catalog from './components/Catalog';
import MainScreen from './components/MainScreen';
import PropertiesScreen from './components/PropertiesScreen';
import './styles/App.css';

function App() {
    const [selectedModule, setSelectedModule] = useState(null);
    const [mainScreenModules, setMainScreenModules] = useState([]);

    //Изменение в handleDrop
// В App.js (уже должно быть исправлено)
    const handleDrop = (item, offset) => {
      setMainScreenModules(prevModules => [...prevModules, {  // Используем prevModules
          ...item,
          instanceId: Date.now(),
          properties: { color: 'blue', size: 'medium' },
          position: { x: offset.x, y: offset.y }
      }]);
    };

    const handleModuleClick = (module) => {
      setSelectedModule(module);
    };

    const updateModuleProperties = (instanceId, newProperties) => {
    setMainScreenModules(
      mainScreenModules.map(m =>
            m.instanceId === instanceId ? { ...m, properties: newProperties } : m
        )
    );
    if(selectedModule && selectedModule.instanceId === instanceId) {
        setSelectedModule({...selectedModule, properties: newProperties });
        }
};
//Добавляем метод изменения позиции
    const updateModulePosition = (instanceId, newPosition) => {
      setMainScreenModules(prevModules =>
        prevModules.map(module => {
          if (module.instanceId === instanceId) {
            return { ...module, position: newPosition }; //Обновляем position у нужного модуля
          }
          return module;
        })
      );
    };



    return (
        <DndProvider backend={HTML5Backend}>
            <div className="app">
                <Catalog />
                 {/* Передаем updateModulePosition */}
                 <MainScreen
                    modules={mainScreenModules}
                    onDrop={handleDrop}
                    onModuleClick={handleModuleClick}
                    updateModulePosition={updateModulePosition} //  Передаём функцию в MainScreen
                />
                <PropertiesScreen selectedModule={selectedModule} updateModuleProperties={updateModuleProperties}/>
            </div>
        </DndProvider>
    );
}

export default App;