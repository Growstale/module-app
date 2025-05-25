import React, { useRef, useEffect } from 'react';
import { useDrag, useDrop } from 'react-dnd';

const MODULE_WIDTH = 100;
const MODULE_HEIGHT = 50;
const PIPE_HEIGHT = 20;
const SPLITTER_COLLECTOR_WIDTH = 70;
const SPLITTER_COLLECTOR_HEIGHT = 70;

const DraggableModule = ({
  module,
  onClick,
  onUpdatePosition,
  onConnect,
  connections,
  isSelected,
  calculatedPipeData,
  viewBoxOffsetX,
  viewBoxOffsetY,
  viewBoxScale,
}) => {
  const moduleRef = useRef(null);
  const isSplitter = module.type === 'splitter';
  const isCollector = module.type === 'collector';
  const isPipe = module.type === 'pipe';
  let displayTitle = module.name;

  if (isPipe && calculatedPipeData && typeof calculatedPipeData === 'object') {
    let foundPipeInfo = null;
    Object.values(calculatedPipeData).forEach(systemData => {
      if (foundPipeInfo) return;
      if (systemData && systemData.suctionLinePipeDetails) {
        const pipe = systemData.suctionLinePipeDetails.find(
          p => String(p.instanceId) === String(module.instanceId)
        );
        if (pipe) foundPipeInfo = pipe;
      }
      if (foundPipeInfo) return;
      if (systemData && systemData.commonPathPipeDetails) {
        const pipe = systemData.commonPathPipeDetails.find(
          p => String(p.instanceId) === String(module.instanceId)
        );
        if (pipe) foundPipeInfo = pipe;
      }
      if (foundPipeInfo) return;
      if (systemData && systemData.branches) {
        Object.values(systemData.branches).forEach(branch => {
          if (foundPipeInfo) return;
          if (branch.pressureLinePipeDetails) {
            const pipe = branch.pressureLinePipeDetails.find(
              p => String(p.instanceId) === String(module.instanceId)
            );
            if (pipe) foundPipeInfo = pipe;
          }
          if (foundPipeInfo) return;
          if (branch.drainLinePipeDetails) {
            const pipe = branch.drainLinePipeDetails.find(
              p => String(p.instanceId) === String(module.instanceId)
            );
            if (pipe) foundPipeInfo = pipe;
          }
        });
      }
      if (foundPipeInfo) return;
      if (systemData && systemData.commonDrainPipesByCollector) {
        Object.values(systemData.commonDrainPipesByCollector).forEach(collectorPipes => {
          if (foundPipeInfo) return;
          const pipe = collectorPipes.find(
            p => String(p.instanceId) === String(module.instanceId)
          );
          if (pipe) foundPipeInfo = pipe;
        });
      }
    });
    if (foundPipeInfo) {
      const titleParts = [
        `${module.name}(ID:...${String(module.instanceId).slice(-4)})`,
        `Скорость: ${foundPipeInfo.velocityMs?.toFixed(3) ?? 'N/A'} м/с`,
        `Re: ${foundPipeInfo.reynolds?.toFixed(0) ?? 'N/A'}`,
        `λ: ${foundPipeInfo.lambda?.toFixed(4) ?? 'N/A'}`,
      ];
      if (foundPipeInfo.frictionLossPa !== undefined) {
        titleParts.push(`ΔP_тр: ${(foundPipeInfo.frictionLossPa / 1e6).toFixed(4)} МПа`);
      }
      if (foundPipeInfo.localLossInPipePa !== undefined) {
        titleParts.push(`ΔP_мест: ${(foundPipeInfo.localLossInPipePa / 1e6).toFixed(4)} МПа`);
      }
      displayTitle = titleParts.join('\n');
    }
  }

  const getPortBusyState = (portIdentifier, portRole) => {
    if (portRole === 'output') {
      return connections.some(conn => String(conn.sourceId) === String(portIdentifier));
    } else {
      return connections.some(conn => String(conn.targetId) === String(portIdentifier));
    }
  };

  const [{ isDragging: isModuleDragging }, moduleDrag, preview] = useDrag(() => ({
    type: 'MODULE_INSTANCE',
    item: () => ({
      instanceId: module.instanceId,
      initialPosition: { x: module.position?.x || 0, y: module.position?.y || 0 },
      type: module.type,
    }),
    collect: (monitor) => ({
      isModuleDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult();
      const deltaScreen = monitor.getDifferenceFromInitialOffset();
      const currentScale = viewBoxScale || 1;
      if (item && deltaScreen && dropResult && dropResult.name === 'MainScreen' && currentScale !== 0) {
        const deltaCanvasX = deltaScreen.x / currentScale;
        const deltaCanvasY = deltaScreen.y / currentScale;
        const newCanvasX = item.initialPosition.x + deltaCanvasX;
        const newCanvasY = item.initialPosition.y + deltaCanvasY;
        onUpdatePosition(item.instanceId, { x: newCanvasX, y: newCanvasY });
      }
    },
  }), [
    module.instanceId,
    module.position?.x,
    module.position?.y,
    onUpdatePosition,
    viewBoxScale,
  ]);

  const useOutputPortDrag = (portIdentifier, canDragCondition, itemData = {}) => {
    const [{ isConnecting }, portDrag] = useDrag(() => ({
      type: 'CONNECTION_PORT',
      item: { sourceId: portIdentifier, ...itemData },
      canDrag: canDragCondition && !getPortBusyState(portIdentifier, 'output'),
      collect: (monitor) => ({
        isConnecting: monitor.isDragging(),
      }),
    }), [
      module.instanceId,
      portIdentifier,
      connections,
      canDragCondition,
      itemData,
      isSplitter,
      isCollector,
    ]);
    return portDrag;
  };

  const defaultPortDrag = useOutputPortDrag(
    module.instanceId,
    !isSplitter && !isCollector && module.type !== 'end' && module.type !== 'engine_input',
    { outputPortIndex: 0 }
  );
  const splitterPortDrag0 = useOutputPortDrag(
    `${module.instanceId}_out0`,
    isSplitter,
    { outputPortIndex: 0, isSplitterOutput: true, splitterInstanceId: module.instanceId }
  );
  const splitterPortDrag1 = useOutputPortDrag(
    `${module.instanceId}_out1`,
    isSplitter,
    { outputPortIndex: 1, isSplitterOutput: true, splitterInstanceId: module.instanceId }
  );
  const collectorPortDrag = useOutputPortDrag(
    module.instanceId,
    isCollector,
    { outputPortIndex: 0 }
  );

  const useInputPortDrop = (targetPortId, isEnabled = true) => {
    const [{ isOver, canDrop }, portDropRefHook] = useDrop(() => ({
      accept: 'CONNECTION_PORT',
      canDrop: (item) => {
        if (!isEnabled) return false;
        if (module.type === 'start' || module.type === 'engine_input') return false;
        if (getPortBusyState(targetPortId, 'input')) return false;

        let sourceInstanceIdForSelfCheck = item.sourceId;
        if (item.isSplitterOutput) {
          sourceInstanceIdForSelfCheck = item.splitterInstanceId;
        }
        if (String(sourceInstanceIdForSelfCheck) === String(module.instanceId)) return false;

        return true;
      },
      drop: (item) => {
        if (isEnabled && item.sourceId && onConnect) {
          onConnect(item.sourceId, targetPortId);
        }
      },
      collect: monitor => ({
        isOver: isEnabled && monitor.isOver() && monitor.canDrop(),
        canDrop: isEnabled && monitor.canDrop(),
      }),
    }), [
      module.instanceId,
      module.type,
      connections,
      targetPortId,
      onConnect,
      isEnabled,
    ]);
    return [{ isOverInput: isOver, canDropOnInput: canDrop }, portDropRefHook];
  };

  const [{ isOverInput: isOverDefaultIn, canDropOnInput: canDropDefaultIn }, defaultPortDrop] = useInputPortDrop(
    module.instanceId,
    !isCollector
  );
  const [{ isOverInput: isOverCollectorIn0, canDropOnInput: canDropCollectorIn0 }, collectorPortDrop0] = useInputPortDrop(
    `${module.instanceId}_in0`,
    isCollector
  );
  const [{ isOverInput: isOverCollectorIn1, canDropOnInput: canDropCollectorIn1 }, collectorPortDrop1] = useInputPortDrop(
    `${module.instanceId}_in1`,
    isCollector
  );

  useEffect(() => {
    if (moduleRef.current) {
      preview(moduleRef.current);
      moduleDrag(moduleRef.current);
    }
  }, [preview, moduleDrag]);

  const handleClick = () => {
    onClick(module);
  };

  const isEngine = module.type === 'engine_input';

  const effectiveScale = viewBoxScale || 1;
  const canvasX = module.position?.x || 0;
  const canvasY = module.position?.y || 0;

  const styles = {
    position: 'absolute',
    left: `${canvasX}px`,
    top: `${canvasY}px`,
    width: `${(isSplitter || isCollector ? SPLITTER_COLLECTOR_WIDTH : MODULE_WIDTH)}px`,
    height: `${(isPipe ? PIPE_HEIGHT : (isSplitter || isCollector ? SPLITTER_COLLECTOR_HEIGHT : MODULE_HEIGHT))}px`,
    backgroundColor: module.properties?.color || '#eee',
    cursor: isModuleDragging ? 'grabbing' : 'grab',
    opacity: isModuleDragging ? 0.5 : 1,
    padding: (isPipe ? '2px 5px' : (isSplitter || isCollector ? '5px' : '10px')),
    border: `${isSelected ? 3 : 1}px solid ${
      isSelected
        ? 'dodgerblue'
        : (isPipe || isSplitter || isCollector
          ? 'gray'
          : (isEngine || module.type === 'tank_output'
            ? 'gold'
            : 'black'))
    }`,
    color: '#333',
    zIndex: isModuleDragging ? 1000 : (isSelected ? 500 : 'auto'),
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: `${(isPipe || isSplitter || isCollector ? 0.8 : 1)}em`,
    userSelect: 'none',
    borderRadius: `${(isSplitter || isCollector ? 5 : 0)}px`
  };

  const portSize = 10;
  const portBorderWidth = 1;

  const portBaseStyle = {
    position: 'absolute',
    width: `${portSize}px`,
    height: `${portSize}px`,
    backgroundColor: '#555',
    border: `${portBorderWidth}px solid black`,
    borderRadius: '50%',
    zIndex: 100,
  };

  const finalGetInputPortStyle = (portId, isOver, canDrop, topPositionPercent = 50) => ({
    ...portBaseStyle,
    left: `-${portSize / 2 + portBorderWidth}px`,
    top: `${topPositionPercent}%`,
    transform: 'translateY(-50%)',
    cursor: canDrop ? 'default' : 'not-allowed',
    backgroundColor: getPortBusyState(portId, 'input') ? 'darkred' : (isOver && canDrop ? 'lightgreen' : '#555'),
  });

  const finalGetOutputPortStyle = (portId, canDragFlag, topPositionPercent = 50) => ({
    ...portBaseStyle,
    right: `-${portSize / 2 + portBorderWidth}px`,
    top: `${topPositionPercent}%`,
    transform: 'translateY(-50%)',
    cursor: canDragFlag && !getPortBusyState(portId, 'output') ? 'crosshair' : 'not-allowed',
    backgroundColor: getPortBusyState(portId, 'output') ? 'darkred' : '#555',
  });

  return (
    <div
      ref={moduleRef}
      className={`draggable-module type-${module.type} ${isSelected ? 'selected' : ''}`}
      style={styles}
      onClick={handleClick}
      title={displayTitle}
    >
      {effectiveScale > 0.4 && !isPipe && !isSplitter && !isCollector && module.name}
      {effectiveScale > 0.4 && (isSplitter || isCollector) && (
        <span style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          lineHeight: `${(isSplitter || isCollector ? SPLITTER_COLLECTOR_HEIGHT : MODULE_HEIGHT) - 10}px`,
        }}>
          {module.name}
        </span>
      )}

      {module.type !== 'start' && module.type !== 'engine_input' && (
        <>
          {isCollector ? (
            <>
              <div
                ref={collectorPortDrop0}
                className="port input-port collector-in-0"
                style={finalGetInputPortStyle(`${module.instanceId}_in0`, isOverCollectorIn0, canDropCollectorIn0, 25)}
                title={`Входной порт 1 (${module.name})`}
              />
              <div
                ref={collectorPortDrop1}
                className="port input-port collector-in-1"
                style={finalGetInputPortStyle(`${module.instanceId}_in1`, isOverCollectorIn1, canDropCollectorIn1, 75)}
                title={`Входной порт 2 (${module.name})`}
              />
            </>
          ) : (
            <div
              ref={defaultPortDrop}
              className="port input-port"
              style={finalGetInputPortStyle(module.instanceId, isOverDefaultIn, canDropDefaultIn, 50)}
              title={`Входной порт (${module.name})`}
            />
          )}
        </>
      )}

      {module.type !== 'engine_input' && module.type !== 'end' && (
        <>
          {isSplitter ? (
            <>
              <div
                ref={splitterPortDrag0}
                className="port output-port splitter-out-0"
                style={finalGetOutputPortStyle(`${module.instanceId}_out0`, true, 25)}
                title={`Выходной порт 1 (${module.name})`}
              />
              <div
                ref={splitterPortDrag1}
                className="port output-port splitter-out-1"
                style={finalGetOutputPortStyle(`${module.instanceId}_out1`, true, 75)}
                title={`Выходной порт 2 (${module.name})`}
              />
            </>
          ) : (
            <div
              ref={module.type === 'collector' ? collectorPortDrag : defaultPortDrag}
              className="port output-port"
              style={finalGetOutputPortStyle(module.instanceId, true, 50)}
              title={
                module.type === 'tank_output'
                  ? "Выход на всасывание"
                  : `Выходной порт (${module.name})`
              }
            />
          )}
        </>
      )}
    </div>
  );
};

export {
  MODULE_WIDTH,
  MODULE_HEIGHT,
  PIPE_HEIGHT,
  SPLITTER_COLLECTOR_WIDTH as SPLITTER_WIDTH,
  SPLITTER_COLLECTOR_HEIGHT as SPLITTER_HEIGHT,
};

export default DraggableModule;