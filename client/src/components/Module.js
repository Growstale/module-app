import React from 'react';
import { useDrag } from 'react-dnd';

const Module = ({ module }) => {
  const [, drag] = useDrag(() => ({
    type: 'MODULE',  //  Тип, должен совпадать с типом в useDrop
    item: { id: module.id, name: module.name }, //  Данные, которые передаются при перетаскивании.
    collect: (monitor) => ({  // Функция для сбора информации о состоянии drag-and-drop
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} className="module" style={{ opacity:  1 }}>
      {module.name}
    </div>
  );
};

export default Module;