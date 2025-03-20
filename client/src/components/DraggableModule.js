// DraggableModule.js (уже должно быть исправлено)
import React, { useRef } from 'react';
import { useDrag } from 'react-dnd';

const DraggableModule = ({ module, onClick, onUpdatePosition }) => {

    const ref = useRef(null);
     const [{ isDragging }, drag, preview] = useDrag(() => ({
        type: 'MODULE_INSTANCE',  //  Другой тип!
        item: () => {
            return { instanceId: module.instanceId };  // Только instanceId
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        end: (item, monitor) => {
           const dropResult = monitor.getDropResult();

           if (item && dropResult) {
                // Считаем смещение от *начальной* позиции модуля:
               const delta = monitor.getDifferenceFromInitialOffset();
                const newX = module.position.x + delta.x;
                const newY = module.position.y + delta.y;

                 onUpdatePosition(item.instanceId, {x: newX, y: newY});// Передаём новые координаты в App
            }
        },
    }));



     const handleClick = () => {
        onClick(module);
    };

    const styles = {
    position: 'absolute',
    left: module.position.x + 'px', // Устанавливаем координаты из module.position
    top: module.position.y + 'px',   // Устанавливаем координаты из module.position
    backgroundColor: module.properties.color,
        cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.5 : 1
  };


     return (
      <div ref={preview}>
          <div
              ref={drag}
                className="draggable-module"
                style={styles}
                onClick={handleClick}

            >
              {module.name} ({module.instanceId})
          </div>
        </div>
    );
};

export default DraggableModule;