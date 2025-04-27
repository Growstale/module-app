import React, { useRef } from 'react';
import { useDrop } from 'react-dnd';
import DraggableModule from './DraggableModule';
import '../styles/MainScreen.css';

const MODULE_WIDTH = 100;
const MODULE_HEIGHT = 50;

const MainScreen = ({ modules, connections, onDrop, onModuleClick, updateModulePosition, onAddConnection, onRemoveConnection  }) => {
    const moduleContainerRef = useRef(null);

        const handleLineClick = (event, connectionId) => {
            event.stopPropagation();
            if (window.confirm("Are you sure you want to delete this connection?")) {
                 onRemoveConnection(connectionId);
            }
        };
        
    const [, drop] = useDrop(() => ({
        accept: ['MODULE', 'MODULE_INSTANCE'], 
        drop: (item, monitor) => {
            const offset = monitor.getClientOffset();
            const container = moduleContainerRef.current;

            if (offset && container) {
                const containerRect = container.getBoundingClientRect();
                let relativeX = offset.x - containerRect.left;
                let relativeY = offset.y - containerRect.top;

                relativeX -= MODULE_WIDTH / 2;
                relativeY -= MODULE_HEIGHT / 2;
                relativeX = Math.max(0, relativeX);
                relativeY = Math.max(0, relativeY);

                const adjustedOffset = { x: relativeX, y: relativeY };
                onDrop(item, adjustedOffset); 
                return { name: 'MainScreen' }; 
            }
            return undefined;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }), [onDrop, modules]); 

    const getPortCenter = (module, portType = 'output') => {
        if (!module || !module.position) return null;
        const x = module.position.x;
        const y = module.position.y;
        const portOffsetX = portType === 'output' ? MODULE_WIDTH : 0; // Right - output, left - input
        const portOffsetY = MODULE_HEIGHT / 2;
        return {
            x: x + portOffsetX,
            y: y + portOffsetY,
        };
    };


    return (
        <div ref={drop} className="main-screen">
            <h2>Main Screen</h2>
            <div
                ref={moduleContainerRef}
                className="module-container"
                style={{ position: 'relative', height: 'calc(100% - 40px)', width: '100%', overflow: 'hidden' }}
            >
                {modules.map((module) => (
                   <DraggableModule
                        key={module.instanceId}
                        module={module}
                        onClick={onModuleClick}
                        onUpdatePosition={updateModulePosition}
                        onConnect={onAddConnection} 
                        connections={connections}
                   />
                ))}


                <svg
                   style={{
                       position: 'absolute',
                       top: 0,
                       left: 0,
                       width: '100%',
                       height: '100%',
                       pointerEvents: 'none', 
                   }}
                >
                   {connections.map(conn => {
                       const sourceModule = modules.find(m => m.instanceId === conn.sourceId);
                       const targetModule = modules.find(m => m.instanceId === conn.targetId);

                       if (sourceModule && targetModule) {
                           const start = getPortCenter(sourceModule, 'output');
                           const end = getPortCenter(targetModule, 'input');

                           if (start && end) {
                               return (
                                <g
                                key={conn.id}
                                className="connection-line"
                                style={{ pointerEvents: 'auto' }}
                             > 
                                   <line
                                       key={conn.id}
                                       x1={start.x}
                                       y1={start.y}
                                       x2={end.x}
                                       y2={end.y}
                                       stroke="black" 
                                       strokeWidth="2" 
                                       markerEnd="url(#arrow)"
                                       onClick={(e) => handleLineClick(e, conn.id)}
                                        cursor="pointer"
                                   />
                                   </g>
                               );
                           }
                       }
                       return null; 
                   })}
                    <defs>
                        <marker
                            id="arrow"
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
                        </marker>
                    </defs>
                </svg>
            </div>
        </div>
    );
};

export default MainScreen;