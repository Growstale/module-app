import React, { useRef, useEffect, useMemo  } from 'react';
import { useDrag, useDrop } from 'react-dnd'; 

const DraggableModule = ({ module, onClick, onUpdatePosition, onConnect, connections  }) => {
    const ref = useRef(null);

    const isOutputPortBusy = useMemo(() => {
        return connections.some(conn => conn.sourceId === module.instanceId);
    }, [connections, module.instanceId]);

    const isInputPortBusy = useMemo(() => {
        return connections.some(conn => conn.targetId === module.instanceId);
    }, [connections, module.instanceId]);
    
    const [{ isDragging: isModuleDragging }, moduleDrag, preview] = useDrag(() => ({
        type: 'MODULE_INSTANCE',
        item: () => ({ instanceId: module.instanceId, initialPosition: { ...module.position }, type: module.type }),
        collect: (monitor) => ({ isModuleDragging: monitor.isDragging() }),
        end: (item, monitor) => {
             const dropResult = monitor.getDropResult();
            const delta = monitor.getDifferenceFromInitialOffset();

            if (item && delta && dropResult && dropResult.name === 'MainScreen') { 
                const newX = item.initialPosition.x + delta.x;
                const newY = item.initialPosition.y + delta.y;
                onUpdatePosition(item.instanceId, { x: newX, y: newY });
            }
        },
    }), [module.instanceId, module.position.x, module.position.y, onUpdatePosition]);

    // --- Drag для ИСХОДЯЩЕГО порта ---
    const [{ isConnecting }, portDrag] = useDrag(() => ({
        type: 'CONNECTION_PORT',
        item: { sourceId: module.instanceId },
        canDrag: module.type !== 'end' && !isOutputPortBusy,
        collect: (monitor) => ({ isConnecting: monitor.isDragging() }),
    }), [module.instanceId, module.type, isOutputPortBusy]); 

    // --- Drop для ВХОДЯЩЕГО порта ---
    const [{ isOverInput, canDropOnInput }, portDrop] = useDrop(() => ({ 
        accept: 'CONNECTION_PORT',
        canDrop: (item, monitor) => module.type !== 'start' && !isInputPortBusy,
        drop: (item, monitor) => {
            if (item.sourceId !== module.instanceId && onConnect && !isInputPortBusy) {
                 onConnect(item.sourceId, module.instanceId);
            }
        },
        collect: monitor => ({
            isOverInput: monitor.isOver() && monitor.canDrop(),
            canDropOnInput: monitor.canDrop(), 
        }),
    }), [module.instanceId, module.type, onConnect, isInputPortBusy]); 

    useEffect(() => {
        if (ref.current) {
            preview(ref.current);
            moduleDrag(ref.current);
        }
    }, [ref, preview, moduleDrag]);

    const handleClick = () => {
        onClick(module);
    };

    const styles = {
        position: 'absolute',
        left: module.position.x + 'px',
        top: module.position.y + 'px',
        backgroundColor: module.properties.color,
        cursor: 'grab',
        opacity: isModuleDragging ? 0.5 : 1,
        padding: '10px',
        border: `2px solid ${module.type === 'start' || module.type === 'end' ? 'gold' : 'black'}`, 
        border: '1px solid black',
        color: 'white',
        zIndex: isModuleDragging ? 1000 : 'auto',
        boxSizing: 'border-box',
        width: `${MODULE_WIDTH}px`,
        height: `${MODULE_HEIGHT}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };
    if (isModuleDragging) styles.cursor = 'grabbing';

    const portBaseStyle = {
        position: 'absolute',
        width: '12px',
        height: '12px',
        backgroundColor: 'gray',
        border: '1px solid black',
        borderRadius: '50%', 
    };

    const outputPortStyle = {
        ...portBaseStyle,
        top: '50%', right: '-6px', transform: 'translateY(-50%)',
        cursor: (module.type === 'end' || isOutputPortBusy) ? 'not-allowed' : 'crosshair', 
        backgroundColor: isOutputPortBusy ? 'darkred' : '#555', 
    };

    const inputPortStyle = {
        ...portBaseStyle,
        top: '50%', left: '-6px', transform: 'translateY(-50%)',
        cursor: (module.type === 'start' || isInputPortBusy) ? 'not-allowed' : 'default',
        backgroundColor: isInputPortBusy ? 'darkred' : '#555', 
    };


    if (isOverInput) {
        inputPortStyle.backgroundColor = 'lightgreen';
    } 

    return (
        <div
            ref={ref}
            className={`draggable-module type-${module.type}`} 
            style={styles}
            onClick={handleClick}
        >
            {module.name} 

             {module.type !== 'start' && (
                <div
                    ref={portDrop}
                    className="port input-port"
                    style={inputPortStyle}
                    title={
                        isInputPortBusy ? "Input port (connected)" :
                        module.type === 'start' ? "Cannot connect to Start" :
                        canDropOnInput ? "Input port (drop here)" : "Input port"
                    }
                ></div>
             )}

            {module.type !== 'end' && (
                <div
                    ref={portDrag}
                    className="port output-port"
                    style={outputPortStyle}
                    title={
                        isOutputPortBusy ? "Output port (connected)" :
                        module.type === 'end' ? "Cannot connect from End" :
                        "Output - Drag to connect"
                    }
                ></div>
            )}
        </div>
    );

};

const MODULE_WIDTH = 100;
const MODULE_HEIGHT = 50;

export default DraggableModule;