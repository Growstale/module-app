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
    onDrop, // Функция обратного вызова, вызываемая при бросании нового модуля на холст
    onModuleClick,
    updateModulePosition,
    onAddConnection,
    onRemoveConnection,
    selectedModule,
    detailedResults,
    problematicModules,
    onDeselectModule // Функция для снятия выделения с модуля при клике на фон
}) => {
    const mainScreenRef = useRef(null); // Реф для самого MainScreen
    const moduleContainerRef = useRef(null); // Реф для div.module-container, на который вешается useDrop и обработчики панорамирования/масштабирования
    
    // Объект, хранящий состояние вида холста
    // x, y: Смещение холста (для панорамирования), k: Коэффициент масштабирования
    const [viewBox, setViewBox] = useState({ x: 0, y: 0, k: 1 });
    const [isPanning, setIsPanning] = useState(false); // происходит ли сейчас панорамирование
    // Координаты начальной точки клика мыши при панорамировании
    const [panStartPoint, setPanStartPoint] = useState({ x: 0, y: 0 });
    // Изначальное смещение viewBox в момент начала панорамирования
    const [initialViewBoxForPan, setInitialViewBoxForPan] = useState({ x: 0, y: 0 });
    const didPanRef = useRef(false); // Флаг, чтобы отличить клик от панорамирования

    // Обрабатывает клик по линии соединения
    const handleLineClick = (event, connectionId) => {
        event.stopPropagation();
        if (window.confirm("Удалить это соединение?")) {
            onRemoveConnection(connectionId);
        }
    };

    // Настраивает MainScreen как область для перетаскивания элементов
    const [, drop] = useDrop(() => ({
        accept: ['MODULE', 'MODULE_INSTANCE'],
        drop: (item, monitor) => {
            const offset = monitor.getClientOffset(); // Получает координаты мыши относительно окна браузера
            const container = moduleContainerRef.current; // Получает размеры и позицию контейнера холста

            if (offset && container) {
                const containerRect = container.getBoundingClientRect();

                // Координаты мыши относительно контейнера холста
                let relativeXToContainer = offset.x - containerRect.left;
                let relativeYToContainer = offset.y - containerRect.top;

                // Преобразуем в координаты холста с учетом текущего масштаба и сдвига
                let canvasX = (relativeXToContainer / viewBox.k) + viewBox.x;
                let canvasY = (relativeYToContainer / viewBox.k) + viewBox.y;
                
                // Позиция корректируется так, чтобы модуль оказался центрированным под курсором
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

                onDrop(item, { x: canvasX, y: canvasY });
                return { name: 'MainScreen' }; // Имя drop target
            }
            return undefined;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }), [onDrop, modules, viewBox.x, viewBox.y, viewBox.k]);

    // Функция для определения координат центра порта на холсте
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

    // Начинаем панорамирование только если клик был не по модулю или линии
    const handleMouseDownOnContainer = useCallback((e) => {
        if (e.target.closest && (e.target.closest('.draggable-module') || e.target.closest('.connection-line'))) {
            return;
        }
        if (e.button === 0 || e.button === 1) { 
            setIsPanning(true);
            setPanStartPoint({ x: e.clientX, y: e.clientY });
            setInitialViewBoxForPan({ x: viewBox.x, y: viewBox.y });
            didPanRef.current = false; 
        }
    }, [viewBox.x, viewBox.y]);

    // Обработчик движения мыши isPanning = true
    const handleGlobalMouseMove = useCallback((e) => {
        if (!isPanning) return;

        const dx = e.clientX - panStartPoint.x;
        const dy = e.clientY - panStartPoint.y;

        if (!didPanRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            didPanRef.current = true; 
        }

        setViewBox(prev => ({
            ...prev,
            x: initialViewBoxForPan.x - (dx / prev.k),
            y: initialViewBoxForPan.y - (dy / prev.k),
        }));
    }, [isPanning, panStartPoint, initialViewBoxForPan, viewBox.k]);

    // Обработчик отпускания кнопки мыши isPanning = true
    const handleGlobalMouseUp = useCallback(() => {
        if (isPanning) {
            setIsPanning(false);
        }
    }, [isPanning]);

    const handleClickOnContainer = useCallback((e) => {
        // Вызываем onDeselectModule только если:
        // 1. Не было панорамирования (didPanRef.current === false)
        // 2. Клик был непосредственно по moduleContainerRef (или его прямому потомку - canvas-layer,
        //    но не по элементу внутри canvas-layer, такому как draggable-module)
        // 3. onDeselectModule передан
        if (!didPanRef.current && onDeselectModule) {
            if (e.target === moduleContainerRef.current || e.target.classList.contains('canvas-layer')) {
                onDeselectModule();
            }
        }
        didPanRef.current = false; 
    }, [onDeselectModule]);
    
    // Обработчик события колеса мыши
    const handleWheelOnContainer = useCallback((e) => {
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
        const kClamped = Math.min(Math.max(newK, 0.1), 5); // Ограничение масштаба

        // Новые координаты верхнего левого угла viewBox, чтобы точка под курсором осталась на месте
        const newViewBoxX = mouseCanvasX_beforeZoom - mouseX / kClamped;
        const newViewBoxY = mouseCanvasY_beforeZoom - mouseY / kClamped;

        setViewBox({ x: newViewBoxX, y: newViewBoxY, k: kClamped });
    }, [viewBox]);

    useEffect(() => {
        if (isPanning) {
            document.addEventListener('mousemove', handleGlobalMouseMove);
            document.addEventListener('mouseup', handleGlobalMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleGlobalMouseMove);
                document.removeEventListener('mouseup', handleGlobalMouseUp);
            };
        }
    }, [isPanning, handleGlobalMouseMove, handleGlobalMouseUp]);
    
    useEffect(() => {
        const containerEl = moduleContainerRef.current;
        if (containerEl) {
            containerEl.addEventListener('wheel', handleWheelOnContainer, { passive: false });
            return () => {
                containerEl.removeEventListener('wheel', handleWheelOnContainer);
            };
        }
    }, [handleWheelOnContainer]);


    return (
        <div
            ref={mainScreenRef} 
            className="main-screen"
            style={{ 
                flexGrow: 1,
                position: 'relative', 
                outline: 'none', 
                cursor: isPanning ? 'grabbing' : 'default' 
            }}
            tabIndex={-1} 
        >
            <div
                ref={(el) => {
                    drop(el); 
                    moduleContainerRef.current = el;
                }}
                className="module-container"
                onMouseDown={handleMouseDownOnContainer}
                onClick={handleClickOnContainer}
                style={{
                    width: '100%',
                    height: '100%', 
                    overflow: 'hidden',
                    position: 'absolute', 
                    top: 0,
                    left: 0,
                    backgroundColor: '#f0f0f0',
                }}
            >
                <div
                    className="canvas-layer"
                    style={{
                        transform: `scale(${viewBox.k}) translate(${-viewBox.x}px, ${-viewBox.y}px)`,
                        transformOrigin: '0 0',
                        width: '10000px', 
                        height: '10000px',
                    }}
                >
                    {modules.map((module) => (
                        <DraggableModule
                            key={module.instanceId}
                            module={module}
                            onClick={(clickedModule, event) => {
                                if (event) event.stopPropagation(); 
                                onModuleClick(clickedModule);
                            }}
                            onUpdatePosition={updateModulePosition}
                            onConnect={onAddConnection}
                            connections={connections}
                            isSelected={selectedModule && selectedModule.instanceId === module.instanceId}
                            calculatedPipeData={detailedResults}
                            viewBoxScale={viewBox.k}
                            problematicModules={problematicModules}
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
                                markerWidth="6" 
                                markerHeight="6"
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
                                            strokeWidth={Math.max(1, 2 / viewBox.k)} 
                                            markerEnd="url(#arrow)"
                                            onClick={(e) => {
                                                e.stopPropagation(); 
                                                handleLineClick(e, conn.id);
                                            }}
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