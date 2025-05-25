import React from 'react';
import { useDrag } from 'react-dnd';

const Module = ({ module }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'MODULE',
    item: {
      id: module.id,
      name: module.name,
      type: module.type,
      system: module.system
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