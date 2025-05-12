import React, { useRef, useEffect, useMemo } from 'react';
import { useDrag, useDrop } from 'react-dnd';

// --- КОНСТАНТЫ РАЗМЕРОВ ---
// Можно вынести или оставить здесь
const MODULE_WIDTH = 100;
const MODULE_HEIGHT = 50;
const PIPE_HEIGHT = 20; // Сделаем трубы пониже для визуального отличия

const DraggableModule = ({ module, onClick, onUpdatePosition, onConnect, connections }) => {
  const ref = useRef(null);

  // --- Логика определения занятости портов ---
  const isOutputPortBusy = useMemo(() => {
    // Исходящий порт занят, если есть соединение, где sourceId - это наш модуль
    return connections.some(conn => conn.sourceId === module.instanceId);
  }, [connections, module.instanceId]);

  const isInputPortBusy = useMemo(() => {
     // Входящий порт занят, если есть соединение, где targetId - это наш модуль
    return connections.some(conn => conn.targetId === module.instanceId);
  }, [connections, module.instanceId]);

  // --- useDrag для перемещения модуля ---
  const [{ isDragging: isModuleDragging }, moduleDrag, preview] = useDrag(() => ({
    type: 'MODULE_INSTANCE',
    item: () => ({ instanceId: module.instanceId, initialPosition: { ...module.position }, type: module.type }),
    collect: (monitor) => ({ isModuleDragging: monitor.isDragging() }),
    end: (item, monitor) => {
        const dropResult = monitor.getDropResult();
        const delta = monitor.getDifferenceFromInitialOffset();
        // Обновляем позицию только если модуль был брошен на MainScreen
        // и сдвиг действительно был
        if (item && delta && dropResult && dropResult.name === 'MainScreen') {
            const newX = item.initialPosition.x + delta.x;
            const newY = item.initialPosition.y + delta.y;
            // Вызываем колбэк для обновления позиции в App.js
            onUpdatePosition(item.instanceId, { x: newX, y: newY });
        }
    },
  }), [module.instanceId, module.position.x, module.position.y, onUpdatePosition]); // Добавляем зависимости

  // --- useDrag для ИСХОДЯЩЕГО порта ---
  const [{ isConnecting }, portDrag] = useDrag(() => ({
    type: 'CONNECTION_PORT',
    item: { sourceId: module.instanceId }, // Передаем ID источника
    // Порт можно тащить, только если это НЕ труба, НЕ конечный узел и НЕ занят
    canDrag: module.type !== 'end' && !isOutputPortBusy,
    collect: (monitor) => ({ isConnecting: monitor.isDragging() }),
    // end: (item, monitor) => { // Можно добавить логику отмены, если не бросили на порт
    // }
  }), [module.instanceId, module.type, isOutputPortBusy]); // Добавляем зависимости

  // --- useDrop для ВХОДЯЩЕГО порта ---
  const [{ isOverInput, canDropOnInput }, portDrop] = useDrop(() => ({
    accept: 'CONNECTION_PORT', // Принимаем только порты
    // На порт можно бросать, только если это НЕ труба, НЕ стартовый узел и НЕ занят
    canDrop: (item, monitor) => module.type !== 'start' && module.type !== 'engine_input' && !isInputPortBusy && item.sourceId !== module.instanceId, // Нельзя соединить сам с собой
    drop: (item, monitor) => {
        // item содержит { sourceId: ... } из useDrag порта
        if (item.sourceId && onConnect) {
             // Вызываем колбэк для добавления соединения в App.js
             onConnect(item.sourceId, module.instanceId);
        }
        // Возвращаем результат дропа, если нужно
        return { droppedOnPort: module.instanceId };
    },
    collect: monitor => ({
        isOverInput: monitor.isOver() && monitor.canDrop(), // Подсвечиваем только если можно бросить
        canDropOnInput: monitor.canDrop(),
    }),
  }), [module.instanceId, module.type, onConnect, isInputPortBusy]); // Добавляем зависимости

  // useEffect для привязки drag/preview
  useEffect(() => {
    if (ref.current) {
        preview(ref.current); // Для превью перемещения
        moduleDrag(ref.current); // Для возможности перемещения самого модуля
    }
  }, [ref, preview, moduleDrag]); // Зависимости добавлены

  // Обработчик клика по модулю
  const handleClick = () => {
    onClick(module); // Вызываем колбэк из App.js для выделения
  };

  // --- Стили модуля ---
  const isPipe = module.type === 'pipe';
  const styles = {
    position: 'absolute',
    left: module.position.x + 'px',
    top: module.position.y + 'px',
    backgroundColor: module.properties?.color || '#eee', // Цвет из свойств, безопасный доступ
    cursor: isModuleDragging ? 'grabbing' : 'grab', // Меняем курсор при перетаскивании
    opacity: isModuleDragging ? 0.5 : 1,
    padding: '10px',
    // Рамка: у труб пунктирная, у start/end - золотая, у остальных - черная
    border: `1px solid ${isPipe ? 'gray' : (module.type === 'engine_input' || module.type === 'tank_output' ? 'gold' : 'black')}`,
    color: '#333', // Темный текст
    zIndex: isModuleDragging ? 1000 : 'auto',
    boxSizing: 'border-box',
    width: `${MODULE_WIDTH}px`,
    height: `${isPipe ? PIPE_HEIGHT : MODULE_HEIGHT}px`, // Разная высота
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: isPipe ? '0.8em' : '1em', // Меньше шрифт для труб
    userSelect: 'none', // Предотвращаем выделение текста при перетаскивании
  };
  // Курсор при перетаскивании модуля
  // if (isModuleDragging) styles.cursor = 'grabbing'; // Уже учтено выше

  // --- Стили портов ---
  const portBaseStyle = {
    position: 'absolute',
    width: '12px',
    height: '12px',
    backgroundColor: 'gray',
    border: '1px solid black',
    borderRadius: '50%',
    zIndex: 1, // Порты над модулем
  };

  // Стиль для исходящего порта (справа)
  const outputPortStyle = {
    ...portBaseStyle,
    top: '50%',
    right: '-6px', // Выносим за пределы модуля
    transform: 'translateY(-50%)',
    // Курсор меняется в зависимости от возможности перетаскивания
    cursor: (module.type === 'end' || isOutputPortBusy) ? 'not-allowed' : 'crosshair',
    backgroundColor: isOutputPortBusy ? 'darkred' : '#555', // Красный, если занят
  };

  // Стиль для входящего порта (слева)
  const inputPortStyle = {
    ...portBaseStyle,
    top: '50%',
    left: '-6px', // Выносим за пределы модуля
    transform: 'translateY(-50%)',
    // Курсор по умолчанию, если нельзя бросить или это стартовый узел
    cursor: (module.type === 'start' || module.type === 'engine_input' || isInputPortBusy || !canDropOnInput) ? 'not-allowed' : 'default',
    backgroundColor: isInputPortBusy ? 'darkred' : '#555', // Красный, если занят
  };

  // Подсветка при наведении на входящий порт (если можно бросить)
  if (isOverInput && canDropOnInput) {
    inputPortStyle.backgroundColor = 'lightgreen';
  }

  return (
    <div
      ref={ref} // Привязываем ref ко всему элементу
      className={`draggable-module type-${module.type}`}
      style={styles}
      onClick={handleClick}
    >
      {!isPipe && module.name}

        <>
          {/* Входящий порт (не для start/engine) */}
          {module.type !== 'start' && module.type !== 'engine_input' && (
            <div
              ref={portDrop} // Привязываем drop к порту
              className="port input-port"
              style={inputPortStyle}
              title={
                    isInputPortBusy ? "Входной порт (занят)" :
                    (module.type === 'start' || module.type === 'engine_input') ? "Нельзя подключить к Start/Engine" :
                    canDropOnInput ? "Входной порт (бросить сюда)" : "Входной порт"
              }
            ></div>
          )}

          {/* Исходящий порт (не для end/tank) */}
          {module.type !== 'end' && (
            <div
              ref={portDrag} // Привязываем drag к порту
              className="port output-port"
              style={outputPortStyle}
              title={
                    isOutputPortBusy ? "Выходной порт (занят)" :
                    (module.type === 'end' || module.type === 'tank_output') ? "Нельзя подключить от End/Tank" :
                    "Выходной порт (тащить для соединения)"
              }
            ></div>
          )}
        </>
    </div>
  );
};

// Экспорт констант может быть полезен в MainScreen
export { MODULE_WIDTH, MODULE_HEIGHT, PIPE_HEIGHT };
export default DraggableModule;