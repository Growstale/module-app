import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import DraggableModule, {
    MODULE_WIDTH,
    MODULE_HEIGHT,
    SPLITTER_HEIGHT,
    SPLITTER_WIDTH,
    PIPE_HEIGHT
} from './DraggableModule';
import '../styles/MainScreen.css';

const MainScreen = ({
    modules,
    connections,
    onDrop,
    onModuleClick,
    updateModulePosition,
    onAddConnection,
    onRemoveConnection,
    selectedModule,
    detailedResults,
}) => {
    const mainScreenRef = useRef(null);
    const moduleContainerRef = useRef(null);

    const [viewBox, setViewBox] = useState({ x: 0, y: 0, k: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStartPoint, setPanStartPoint] = useState({ x: 0, y: 0 });
    const [initialViewBox, setInitialViewBox] = useState({ x: 0, y: 0 });

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

                let relativeXToViewport = offset.x - containerRect.left;
                let relativeYToViewport = offset.y - containerRect.top;

                let canvasX = (relativeXToViewport / viewBox.k) + viewBox.x;
                let canvasY = (relativeYToViewport / viewBox.k) + viewBox.y;

                if (!item.instanceId) {
                    let dropWidth = MODULE_WIDTH;
                    let dropHeight = MODULE_HEIGHT;
                    if (item.type === 'pipe') {
                        dropHeight = PIPE_HEIGHT;
                    } else if (item.type === 'splitter' || item.type === 'collector') {
                        dropWidth = SPLITTER_WIDTH;
                        dropHeight = SPLITTER_HEIGHT;
                    }
                    canvasX -= (dropWidth / 2);
                    canvasY -= (dropHeight / 2);
                }

                onDrop(item, { x: canvasX, y: canvasY });
                return { name: 'MainScreen' };
            }
            return undefined;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }), [onDrop, modules, viewBox.x, viewBox.y, viewBox.k]);

    const getPortCenterOnCanvas = (portId, portRole = 'output') => {
        const portIdStr = String(portId);
        let moduleInstance;
        let isMultiPort = false;
        let portIndex = 0;

        if (portIdStr.includes('_out')) {
            const parts = portIdStr.split('_out');
            moduleInstance = modules.find(m => String(m.instanceId) === parts[0]);
            portIndex = parseInt(parts[1], 10);
            isMultiPort = true;
        } else if (portIdStr.includes('_in')) {
            const parts = portIdStr.split('_in');
            moduleInstance = modules.find(m => String(m.instanceId) === parts[0]);
            portIndex = parseInt(parts[1], 10);
            isMultiPort = true;
        } else {
            moduleInstance = modules.find(m => String(m.instanceId) === portIdStr);
        }

        if (!moduleInstance || !moduleInstance.position) return null;

        const moduleCanvasX = moduleInstance.position.x;
        const moduleCanvasY = moduleInstance.position.y;

        let currentModuleWidth = MODULE_WIDTH;
        let currentModuleHeight = MODULE_HEIGHT;

        if (moduleInstance.type === 'pipe') {
            currentModuleHeight = PIPE_HEIGHT;
        } else if (moduleInstance.type === 'splitter' || moduleInstance.type === 'collector') {
            currentModuleWidth = SPLITTER_WIDTH;
            currentModuleHeight = SPLITTER_HEIGHT;
        }

        let portCanvasOffsetX, portCanvasOffsetY;

        if (portRole === 'output') {
            portCanvasOffsetX = currentModuleWidth;
            portCanvasOffsetY = currentModuleHeight *
                (isMultiPort && moduleInstance.type === 'splitter' ? (portIndex === 0 ? 0.25 : 0.75) : 0.5);
        } else {
            portCanvasOffsetX = 0;
            portCanvasOffsetY = currentModuleHeight *
                (isMultiPort && moduleInstance.type === 'collector' ? (portIndex === 0 ? 0.25 : 0.75) : 0.5);
        }

        return {
            x: moduleCanvasX + portCanvasOffsetX,
            y: moduleCanvasY + portCanvasOffsetY,
        };
    };

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest && (e.target.closest('.draggable-module') || e.target.closest('.connection-line svg'))) {
        return; 
    }
    
    if (e.button === 0 || e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        setPanStartPoint({ x: e.clientX, y: e.clientY });
        setInitialViewBox({ x: viewBox.x, y: viewBox.y });
    }
  }, [viewBox.x, viewBox.y]); 

    const handleMouseMove = useCallback((e) => {
        if (isPanning) {
            e.preventDefault();
            const dx = e.clientX - panStartPoint.x;
            const dy = e.clientY - panStartPoint.y;

            setViewBox(prev => ({
                ...prev,
                x: initialViewBox.x - (dx / prev.k),
                y: initialViewBox.y - (dy / prev.k),
            }));
        }
    }, [isPanning, panStartPoint, initialViewBox]);

    const handleMouseUp = useCallback(() => {
        if (isPanning) {
            setIsPanning(false);
        }
    }, [isPanning]);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        const scaleAmount = 1.1;
        const container = moduleContainerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        const mouseCanvasX_beforeZoom = viewBox.x + mouseX / viewBox.k;
        const mouseCanvasY_beforeZoom = viewBox.y + mouseY / viewBox.k;

        const newK = e.deltaY < 0 ? viewBox.k * scaleAmount : viewBox.k / scaleAmount;
        const kClamped = Math.min(Math.max(newK, 0.1), 5);

        const newViewBoxX = mouseCanvasX_beforeZoom - mouseX / kClamped;
        const newViewBoxY = mouseCanvasY_beforeZoom - mouseY / kClamped;

        setViewBox({ x: newViewBoxX, y: newViewBoxY, k: kClamped });
    }, [viewBox]);

    useEffect(() => {
        const mainEl = mainScreenRef.current;
        if (mainEl) {
            mainEl.addEventListener('mousemove', handleMouseMove);
            mainEl.addEventListener('mouseup', handleMouseUp);
            mainEl.addEventListener('mouseleave', handleMouseUp);
            mainEl.addEventListener('wheel', handleWheel, { passive: false });

            return () => {
                mainEl.removeEventListener('mousemove', handleMouseMove);
                mainEl.removeEventListener('mouseup', handleMouseUp);
                mainEl.removeEventListener('mouseleave', handleMouseUp);
                mainEl.removeEventListener('wheel', handleWheel);
            };
        }
    }, [handleMouseMove, handleMouseUp, handleWheel]);

    return (
        <div
            ref={(el) => {
                drop(el);
                mainScreenRef.current = el;
            }}
            className="main-screen"
            onMouseDown={handleMouseDown}
            style={{ cursor: isPanning ? 'grabbing' : 'default', outline: 'none' }}
            tabIndex={-1}
        >
            <div
                ref={moduleContainerRef}
                className="module-container"
                style={{
                    width: '100%',
                    height: 'calc(100% - 40px)',
                    overflow: 'hidden',
                    position: 'relative',
                    backgroundColor: '#f0f0f0',
                }}
            >
                <div
                    className="canvas-layer"
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        transform: `scale(${viewBox.k}) translate(${-viewBox.x}px, ${-viewBox.y}px)`,
                        transformOrigin: '0 0',
                        width: '5000px',
                        height: '5000px',
                    }}
                >
                    {modules.map((module) => (
                        <DraggableModule
                            key={module.instanceId}
                            module={module}
                            onClick={onModuleClick}
                            onUpdatePosition={updateModulePosition}
                            onConnect={onAddConnection}
                            connections={connections}
                            isSelected={selectedModule && selectedModule.instanceId === module.instanceId}
                            calculatedPipeData={detailedResults}
                            viewBoxScale={viewBox.k}
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
                        <defs>
                            <marker
                                id="arrow"
                                viewBox="0 0 10 10"
                                refX="8"
                                refY="5"
                                markerWidth={6}
                                markerHeight={6}
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
                            </marker>
                        </defs>
                        {connections.map(conn => {
                            const startCanvas = getPortCenterOnCanvas(String(conn.sourceId), 'output');
                            const endCanvas = getPortCenterOnCanvas(String(conn.targetId), 'input');

                            if (startCanvas && endCanvas) {
                                return (
                                    <g
                                        key={conn.id}
                                        className="connection-line"
                                        style={{ pointerEvents: 'auto' }}
                                    >
                                        <line
                                            x1={startCanvas.x} y1={startCanvas.y}
                                            x2={endCanvas.x} y2={endCanvas.y}
                                            stroke="black"
                                            strokeWidth={2 / viewBox.k}
                                            markerEnd="url(#arrow)"
                                            onClick={(e) => handleLineClick(e, conn.id)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </g>
                                );
                            }
                            return null;
                        })}
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default MainScreen;