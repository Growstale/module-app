import React from 'react';
import { useDrop } from 'react-dnd';
import DraggableModule from './DraggableModule';
import '../styles/MainScreen.css';

const MainScreen = ({ modules, onDrop, onModuleClick, updateModulePosition }) => {  // Добавили пропс updateModulePosition
    const [, drop] = useDrop(() => ({
        accept: 'MODULE',
        drop: (item, monitor) => {
            const offset = monitor.getClientOffset();
              const mainScreenRect = document.querySelector('.main-screen').getBoundingClientRect();

            if (offset) {
                //Корректировка, для учета положения самого .main-screen
              const adjustedOffset = {
                x: offset.x - mainScreenRect.left,
                y: offset.y - mainScreenRect.top
              };
              onDrop(item, adjustedOffset); //Передаем именно adjustedOffset
            }

            return { name: 'MainScreen' };
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }));

    return (
        <div ref={drop} className="main-screen">
            <h2>Main Screen</h2>
            <div className="module-container">
                {modules.map((module) => (
                   <DraggableModule
                        key={module.instanceId}
                        module={module}
                        onClick={onModuleClick}
                        onUpdatePosition={updateModulePosition}  // Передаем функцию
                   />
                ))}
            </div>
        </div>
    );
};

export default MainScreen;