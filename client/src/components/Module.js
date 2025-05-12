import React from 'react';
import { useDrag } from 'react-dnd';

// useDrag - to make element draggable
// to make DOM-element draggable you need to connect drag function to it
const Module = ({ module }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'MODULE', // draggable name
    item: {
      id: module.id,
      name: module.name,
      type: module.type,
      system: module.system // <-- ДОБАВЛЕНО
  },
  collect: (monitor) => ({ 
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} className="module" style={{ opacity: isDragging ? 0.5 : 1 }}>
      {module.name}
    </div>
  );
};

export default Module;