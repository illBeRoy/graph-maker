import { useCallback, useState, useRef, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  BaseEdge,
  useNodesState,
  Handle,
  Position,
} from '@xyflow/react'
import type { Node, Edge, EdgeProps, NodeChange, NodePositionChange, NodeProps } from '@xyflow/react'
import { toPng } from 'html-to-image'
import '@xyflow/react/dist/style.css'
import './App.css'
import { TableMaker } from './components/TableMaker'

// Types
interface TreeNodeData {
  id: string
  label: string
  children: string[]
  position?: { x: number; y: number }
}

interface ParsedCSV {
  nodes: TreeNodeData[]
}

interface NodeBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

// Node dimensions (approximate - ReactFlow default node size)
const NODE_WIDTH = 150
const NODE_HEIGHT = 40

// Distinct color palette for nodes/edges
const COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#7c3aed', // violet
  '#ca8a04', // yellow
  '#0d9488', // teal
  '#e11d48', // rose
]

// Routing data passed to edges - includes shared routing channels
interface RoutingData {
  nodes: NodeBox[]
  // Map from "sourceY-targetY" to the horizontal channel Y position
  horizontalChannels: Map<string, number>
  // Map from targetId to the shared vertical trunk X position  
  verticalTrunks: Map<string, { x: number; y: number }>
  // Map from nodeId to its assigned color
  nodeColors: Map<string, string>
}

// Calculate merged edge path using shared routing channels
function calculateMergedPath(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  _sourceId: string,
  targetId: string,
  routingData: RoutingData
): string {
  const startX = sourceX
  const startY = sourceY
  const endX = targetX
  const endY = targetY
  
  // Get the shared horizontal channel for this source-target Y range
  const channelKey = `${Math.round(startY)}-${Math.round(endY)}`
  const channelY = routingData.horizontalChannels.get(channelKey)
  
  // Get the shared vertical trunk for this target (if multiple edges go to same target)
  const verticalTrunk = routingData.verticalTrunks.get(targetId)
  
  // Simple case: source and target are vertically aligned
  if (Math.abs(startX - endX) < 1) {
    return `M ${startX} ${startY} L ${endX} ${endY}`
  }
  
  // Use shared horizontal channel if available, otherwise calculate midpoint
  const horizontalY = channelY ?? (startY + endY) / 2
  
  // If there's a shared vertical trunk for this target
  if (verticalTrunk && Math.abs(verticalTrunk.x - endX) < 1) {
    // Route to the trunk X position, then down the shared trunk
    return `M ${startX} ${startY} L ${startX} ${horizontalY} L ${verticalTrunk.x} ${horizontalY} L ${verticalTrunk.x} ${endY}`
  }
  
  // Standard orthogonal path with shared horizontal channel
  return `M ${startX} ${startY} L ${startX} ${horizontalY} L ${endX} ${horizontalY} L ${endX} ${endY}`
}

// Custom orthogonal edge component with merged paths
function OrthogonalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const routingData = data as RoutingData | undefined
  
  const path = calculateMergedPath(
    sourceX, sourceY,
    targetX, targetY,
    source,
    target,
    routingData ?? { nodes: [], horizontalChannels: new Map(), verticalTrunks: new Map(), nodeColors: new Map() }
  )
  
  // Get the target node's color for this edge
  const targetColor = routingData?.nodeColors.get(target)
  
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{ ...style, stroke: targetColor }}
    />
  )
}

const edgeTypes = {
  orthogonal: OrthogonalEdge,
}

// Custom node with multiple source handles (one per outgoing edge)
function MultiHandleNode({ data }: NodeProps) {
  const children: string[] = (data as { children?: string[] }).children || []
  const label = (data as { label: string }).label
  const nodeStyle = (data as { nodeStyle?: React.CSSProperties }).nodeStyle
  
  return (
    <div className="multi-handle-node" style={nodeStyle}>
      {/* Single incoming handle at top center */}
      <Handle type="target" position={Position.Top} />
      
      <div className="node-label">{label}</div>
      
      {/* Multiple outgoing handles at bottom, evenly spaced */}
      {children.map((childId, index) => (
        <Handle
          key={childId}
          type="source"
          position={Position.Bottom}
          id={`source-${childId}`}
          style={{ left: `${((index + 1) / (children.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  )
}

const nodeTypes = {
  multiHandle: MultiHandleNode,
}

// CSV Parser
// Format: id,label,children[,x;y]
function parseCSV(content: string): ParsedCSV {
  const lines = content.trim().split('\n')
  const nodes: TreeNodeData[] = []

  for (const line of lines) {
    const parts = line.split(',')
    if (parts.length < 2) continue

    const id = parts[0].trim()
    const label = parts[1].trim()
    const childrenStr = parts[2]?.trim() || ''
    const children = childrenStr ? childrenStr.split(';').map(c => c.trim()).filter(Boolean) : []
    
    // Parse optional 4th column for x;y coordinates
    const positionStr = parts[3]?.trim()
    let position: { x: number; y: number } | undefined
    if (positionStr) {
      const [xStr, yStr] = positionStr.split(';')
      const x = parseFloat(xStr)
      const y = parseFloat(yStr)
      if (!isNaN(x) && !isNaN(y)) {
        position = { x, y }
      }
    }

    nodes.push({ id, label, children, position })
  }

  return { nodes }
}

// Tree Layout Algorithm
function calculateTreeLayout(parsed: ParsedCSV): { nodes: Node[]; edges: Edge[] } {
  const { nodes: treeNodes } = parsed
  const nodeMap = new Map(treeNodes.map(n => [n.id, n]))

  // Assign distinct colors to each node (before node creation so we can style them)
  const nodeColors = new Map<string, string>()
  treeNodes.forEach((node, index) => {
    nodeColors.set(node.id, COLORS[index % COLORS.length])
  })

  // Check if all nodes have explicit positions
  const hasExplicitPositions = treeNodes.every(n => n.position !== undefined)

  const flowNodes: Node[] = []

  if (hasExplicitPositions) {
    // Use explicit positions from CSV
    for (const node of treeNodes) {
      const nodeColor = nodeColors.get(node.id) ?? COLORS[0]
      flowNodes.push({
        id: node.id,
        type: 'multiHandle',
        position: node.position!,
        data: { 
          label: node.label,
          children: node.children,
          nodeStyle: {
            borderColor: nodeColor,
            borderWidth: 2,
          },
        },
      })
    }
  } else {
    // Compute layout based on tree depth
    const nodeDepths = new Map<string, number>()

    // Compute depths from graph traversal
    const allChildIds = new Set(treeNodes.flatMap(n => n.children))
    const rootIds = treeNodes.filter(n => !allChildIds.has(n.id)).map(n => n.id)

    function assignDepth(nodeId: string, depth: number) {
      if (nodeDepths.has(nodeId)) {
        if (depth > nodeDepths.get(nodeId)!) {
          nodeDepths.set(nodeId, depth)
        }
        return
      }
      nodeDepths.set(nodeId, depth)

      const node = nodeMap.get(nodeId)
      if (node) {
        for (const childId of node.children) {
          assignDepth(childId, depth + 1)
        }
      }
    }

    for (const rootId of rootIds) {
      assignDepth(rootId, 0)
    }

    for (const node of treeNodes) {
      if (!nodeDepths.has(node.id)) {
        assignDepth(node.id, 0)
      }
    }

    // Group nodes by their y-layer
    const nodeLevels = new Map<number, string[]>()
    for (const [nodeId, depth] of nodeDepths) {
      if (!nodeLevels.has(depth)) {
        nodeLevels.set(depth, [])
      }
      nodeLevels.get(depth)!.push(nodeId)
    }

    // Layout constants
    const HORIZONTAL_SPACING = 200
    const VERTICAL_SPACING = 120

    // Position nodes
    const maxDepth = Math.max(...nodeLevels.keys())

    for (let depth = 0; depth <= maxDepth; depth++) {
      const nodesAtLevel = nodeLevels.get(depth) || []
      const levelWidth = nodesAtLevel.length * HORIZONTAL_SPACING
      const startX = -levelWidth / 2 + HORIZONTAL_SPACING / 2

      nodesAtLevel.forEach((nodeId, index) => {
        const node = nodeMap.get(nodeId)
        if (node) {
          const nodeColor = nodeColors.get(nodeId) ?? COLORS[0]
          flowNodes.push({
            id: nodeId,
            type: 'multiHandle',
            position: {
              x: startX + index * HORIZONTAL_SPACING,
              y: depth * VERTICAL_SPACING,
            },
            data: { 
              label: node.label,
              children: node.children,
              nodeStyle: {
                borderColor: nodeColor,
                borderWidth: 2,
              },
            },
          })
        }
      })
    }
  }

  // Create node boxes for edge routing
  const nodeBoxes: NodeBox[] = flowNodes.map(n => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }))

  // Build position lookup for nodes
  const nodePositions = new Map<string, { x: number; y: number }>()
  for (const n of flowNodes) {
    nodePositions.set(n.id, { x: n.position.x + NODE_WIDTH / 2, y: n.position.y })
  }

  // Compute shared horizontal channels between layer pairs
  // Group edges by their source and target Y layers
  const edgesByLayers = new Map<string, { sourceX: number; targetX: number; targetId: string }[]>()
  
  for (const node of treeNodes) {
    const sourcePos = nodePositions.get(node.id)
    if (!sourcePos) continue
    
    for (const childId of node.children) {
      const targetPos = nodePositions.get(childId)
      if (!targetPos) continue
      
      // Source Y is bottom of source node, target Y is top of target node
      const sourceY = sourcePos.y + NODE_HEIGHT
      const targetY = targetPos.y
      const key = `${Math.round(sourceY)}-${Math.round(targetY)}`
      
      if (!edgesByLayers.has(key)) {
        edgesByLayers.set(key, [])
      }
      edgesByLayers.get(key)!.push({
        sourceX: sourcePos.x,
        targetX: targetPos.x,
        targetId: childId,
      })
    }
  }

  // Create horizontal channels at the midpoint between layers
  const horizontalChannels = new Map<string, number>()
  for (const [key] of edgesByLayers) {
    const [sourceYStr, targetYStr] = key.split('-')
    const sourceY = parseInt(sourceYStr, 10)
    const targetY = parseInt(targetYStr, 10)
    // Place the horizontal channel at the midpoint
    horizontalChannels.set(key, (sourceY + targetY) / 2)
  }

  // Compute shared vertical trunks for targets that receive multiple edges
  // Group edges by target
  const edgesByTarget = new Map<string, { sourceX: number; sourceY: number }[]>()
  for (const node of treeNodes) {
    const sourcePos = nodePositions.get(node.id)
    if (!sourcePos) continue
    
    for (const childId of node.children) {
      if (!edgesByTarget.has(childId)) {
        edgesByTarget.set(childId, [])
      }
      edgesByTarget.get(childId)!.push({
        sourceX: sourcePos.x,
        sourceY: sourcePos.y + NODE_HEIGHT,
      })
    }
  }

  // For targets with multiple incoming edges, compute a shared trunk
  const verticalTrunks = new Map<string, { x: number; y: number }>()
  for (const [targetId, sources] of edgesByTarget) {
    if (sources.length > 1) {
      const targetPos = nodePositions.get(targetId)
      if (!targetPos) continue
      
      // The vertical trunk X is the target's X (center)
      // The trunk Y is where they all merge (at the horizontal channel level)
      const trunkY = (Math.min(...sources.map(s => s.sourceY)) + targetPos.y) / 2
      verticalTrunks.set(targetId, { x: targetPos.x, y: trunkY })
    }
  }

  // Create routing data shared by all edges
  const routingData: RoutingData = {
    nodes: nodeBoxes,
    horizontalChannels,
    verticalTrunks,
    nodeColors,
  }

  // Create edges with orthogonal routing
  const flowEdges: Edge[] = []
  for (const node of treeNodes) {
    for (const childId of node.children) {
      const targetColor = nodeColors.get(childId) ?? COLORS[0]
      flowEdges.push({
        id: `${node.id}-${childId}`,
        source: node.id,
        sourceHandle: `source-${childId}`,
        target: childId,
        type: 'orthogonal',
        markerEnd: { type: MarkerType.ArrowClosed, color: targetColor },
        style: { stroke: targetColor },
        data: routingData as unknown as Record<string, unknown>,
      })
    }
  }

  return { nodes: flowNodes, edges: flowEdges }
}

// Serialize graph back to CSV format
function serializeToCSV(nodes: Node[], edges: Edge[]): string {
  // Build a map of node children from edges
  const childrenMap = new Map<string, string[]>()
  for (const edge of edges) {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, [])
    }
    childrenMap.get(edge.source)!.push(edge.target)
  }

  // Build CSV lines (format: id,label,children,x;y)
  const lines: string[] = []
  for (const node of nodes) {
    const id = node.id
    const label = (node.data as { label: string }).label
    const children = childrenMap.get(id)?.join(';') ?? ''
    const position = `${Math.round(node.position.x)};${Math.round(node.position.y)}`
    lines.push(`${id},${label},${children},${position}`)
  }

  return lines.join('\n')
}

// Download helper
function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// Upload Icon
function UploadIcon() {
  return (
    <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  )
}

// Snap threshold in pixels
const SNAP_THRESHOLD = 15

// Graph View Component
function GraphView({ 
  initialNodes, 
  edges, 
  onReset,
  onLoad,
}: { 
  initialNodes: Node[]
  edges: Edge[]
  onReset: () => void
  onLoad: (file: File) => void
}) {
  const { fitView, getNodes, getViewport } = useReactFlow()
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const loadInputRef = useRef<HTMLInputElement>(null)
  const reactFlowRef = useRef<HTMLDivElement>(null)

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const handleExportPng = useCallback(async () => {
    const flowElement = reactFlowRef.current?.querySelector('.react-flow__viewport') as HTMLElement
    if (!flowElement) return

    const currentNodes = getNodes()
    if (currentNodes.length === 0) return

    // Calculate bounding box of all nodes in flow coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of currentNodes) {
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + NODE_WIDTH)
      maxY = Math.max(maxY, node.position.y + NODE_HEIGHT)
    }

    // Add 3% padding
    const width = maxX - minX
    const height = maxY - minY
    const paddingX = width * 0.03
    const paddingY = height * 0.03
    minX -= paddingX
    minY -= paddingY
    maxX += paddingX
    maxY += paddingY

    const { x: viewX, y: viewY, zoom } = getViewport()

    // Calculate the screen coordinates of the bounding box
    const screenMinX = minX * zoom + viewX
    const screenMinY = minY * zoom + viewY
    const screenWidth = (maxX - minX) * zoom
    const screenHeight = (maxY - minY) * zoom

    try {
      // Capture the entire ReactFlow container (including background)
      const flowContainer = reactFlowRef.current?.querySelector('.react-flow') as HTMLElement
      if (!flowContainer) return

      const dataUrl = await toPng(flowContainer, {
        pixelRatio: 2,
      })

      // Create an image to crop from
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Set canvas size to cropped dimensions (accounting for pixelRatio)
        const pixelRatio = 2
        canvas.width = screenWidth * pixelRatio
        canvas.height = screenHeight * pixelRatio

        // Draw the cropped portion
        ctx.drawImage(
          img,
          screenMinX * pixelRatio,
          screenMinY * pixelRatio,
          screenWidth * pixelRatio,
          screenHeight * pixelRatio,
          0,
          0,
          screenWidth * pixelRatio,
          screenHeight * pixelRatio
        )

        // Download the cropped image
        const link = document.createElement('a')
        link.download = 'graph.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
      img.src = dataUrl
    } catch (error) {
      console.error('Failed to export PNG:', error)
    }
  }, [getNodes, getViewport])

  const handleSave = useCallback(() => {
    const csv = serializeToCSV(nodes, edges)
    downloadCSV(csv, 'graph.csv')
  }, [nodes, edges])

  const handleLoadClick = useCallback(() => {
    loadInputRef.current?.click()
  }, [])

  const handleLoadFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onLoad(file)
    }
    // Reset input so the same file can be loaded again
    if (loadInputRef.current) {
      loadInputRef.current.value = ''
    }
  }, [onLoad])

  // Snapping handler that wraps onNodesChange
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const snappedChanges = changes.map((change) => {
      // Only process position changes that have a position
      if (change.type !== 'position' || !change.position) {
        return change
      }

      const posChange = change as NodePositionChange
      const draggedNodeId = posChange.id
      let { x, y } = change.position

      // Find snap targets from other nodes
      for (const node of nodes) {
        if (node.id === draggedNodeId) continue

        // Snap X axis independently
        if (Math.abs(node.position.x - x) < SNAP_THRESHOLD) {
          x = node.position.x
        }

        // Snap Y axis independently
        if (Math.abs(node.position.y - y) < SNAP_THRESHOLD) {
          y = node.position.y
        }
      }

      return {
        ...posChange,
        position: { x, y },
      }
    })

    onNodesChange(snappedChanges)
  }, [nodes, onNodesChange])

  return (
    <div className="graph-container">
      <div className="toolbar">
        <button className="toolbar-btn" onClick={onReset}>
          ← New File
        </button>
        <button className="toolbar-btn" onClick={handleFitView}>
          ⊡ Fit View
        </button>
        <div className="toolbar-separator" />
        <button className="toolbar-btn" onClick={handleLoadClick}>
          📂 Load
        </button>
        <button className="toolbar-btn" onClick={handleSave}>
          💾 Save
        </button>
        <button className="toolbar-btn" onClick={handleExportPng}>
          📷 Export PNG
        </button>
        <input
          ref={loadInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleLoadFile}
        />
      </div>
      <div ref={reactFlowRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
      </ReactFlow>
      </div>
    </div>
  )
}

// Main App Component
function App() {
  const [graphData, setGraphData] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showTableMaker, setShowTableMaker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const parsed = parseCSV(content)
      const layout = calculateTreeLayout(parsed)
      setGraphData(layout)
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) {
      handleFile(file)
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleReset = useCallback(() => {
    setGraphData(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleCsvCreated = useCallback((csv: string) => {
    const parsed = parseCSV(csv)
    const layout = calculateTreeLayout(parsed)
    setGraphData(layout)
    setShowTableMaker(false)
  }, [])

  // Handle paste event on the upload screen
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text')
    if (text && text.includes(',')) {
      // Basic check: if it has commas, try to parse as CSV
      const parsed = parseCSV(text)
      if (parsed.nodes.length > 0) {
        const layout = calculateTreeLayout(parsed)
        setGraphData(layout)
      }
    }
  }, [])

  // Listen for paste events only when on the upload screen
  useEffect(() => {
    if (!graphData && !showTableMaker) {
      document.addEventListener('paste', handlePaste)
      return () => document.removeEventListener('paste', handlePaste)
    }
  }, [graphData, showTableMaker, handlePaste])

  const memoizedGraphView = useMemo(() => {
    if (!graphData) return null
    return (
      <ReactFlowProvider>
        <GraphView 
          initialNodes={graphData.nodes} 
          edges={graphData.edges} 
          onReset={handleReset}
          onLoad={handleFile}
        />
      </ReactFlowProvider>
    )
  }, [graphData, handleReset, handleFile])

  if (graphData) {
    return <div className="app">{memoizedGraphView}</div>
  }

  if (showTableMaker) {
    return (
      <div className="app">
        <div className="upload-screen">
          <TableMaker 
            onCsvCreated={handleCsvCreated} 
            onCancel={() => setShowTableMaker(false)} 
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="upload-screen">
        <a href="https://github.com/illBeRoy/graph-maker" target='_blank' style={{appearance: 'none', textDecoration: 'none'}}>
          <h1 className="upload-title">
            <span>graph</span>maker
          </h1>
        </a>
        <p className="upload-subtitle">
          Built with ♥ by <a href="https://www.linkedin.com/in/roysommer/" target="_blank" rel="noopener noreferrer">Roy Sommer</a>
        </p>
        <div
          className={`dropzone ${isDragOver ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
        >
          <UploadIcon />
          <p className="dropzone-text">Drop a CSV file here, click to upload, or paste CSV data</p>
        </div>
        <button 
          className="create-new-btn"
          onClick={() => setShowTableMaker(true)}
        >
          + Create new CSV
        </button>
        <a 
          href="https://gemini.google.com/gem/1iacXBByzAxhWjs-bIMprxGnhOYCBBM-a"
          target="_blank"
          rel="noopener noreferrer"
          className="create-new-btn gemini-btn"
        >
          ✨ Create with Gemini
        </a>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
    </div>
  )
}

export default App
