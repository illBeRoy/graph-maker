import { useState, useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import './TableMaker.css'

export interface TableMakerProps {
  onCsvCreated: (csv: string) => void
  onCancel: () => void
}

interface RowData {
  title: string
  pointsAt: number[]
}

function TagInput({ 
  tags, 
  onChange 
}: { 
  tags: number[]
  onChange: (tags: number[]) => void 
}) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const num = parseInt(inputValue.trim(), 10)
      if (!isNaN(num) && !tags.includes(num)) {
        onChange([...tags, num])
        setInputValue('')
      }
      e.preventDefault()
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }, [inputValue, tags, onChange])

  const handleRemoveTag = useCallback((index: number) => {
    onChange(tags.filter((_, i) => i !== index))
  }, [tags, onChange])

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag, index) => (
        <span key={index} className="tag">
          {tag}
          <button 
            type="button" 
            className="tag-remove" 
            onClick={(e) => { e.stopPropagation(); handleRemoveTag(index) }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? "Type ID, Enter" : ""}
        className="tag-input-field"
      />
    </div>
  )
}

export function TableMaker({ onCsvCreated, onCancel }: TableMakerProps) {
  const [rows, setRows] = useState<RowData[]>([
    { title: 'Root', pointsAt: [1,2] },
    { title: 'Leaf A', pointsAt: [] },
    { title: 'Leaf B', pointsAt: [3] },
    { title: 'Leaf C', pointsAt: [] }
  ])

  const handleTitleChange = useCallback((index: number, value: string) => {
    setRows(prev => prev.map((row, i) => 
      i === index ? { ...row, title: value } : row
    ))
  }, [])

  const handlePointsAtChange = useCallback((index: number, tags: number[]) => {
    setRows(prev => prev.map((row, i) => 
      i === index ? { ...row, pointsAt: tags } : row
    ))
  }, [])

  const handleAddRow = useCallback(() => {
    setRows(prev => [...prev, { title: '', pointsAt: [] }])
  }, [])

  const handleRemoveRow = useCallback((index: number) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter((_, i) => i !== index))
    }
  }, [rows.length])

  const handleCreate = useCallback(() => {
    // Generate CSV in format: id,label,children(;-separated)
    const csvLines = rows.map((row, index) => {
      const id = index
      const label = row.title || `Node ${index}`
      const children = row.pointsAt.join(';')
      return `${id},${label},${children}`
    })
    onCsvCreated(csvLines.join('\n'))
  }, [rows, onCsvCreated])

  return (
    <div className="table-maker">
      <div className="table-maker-header">
        <h2>Create New Graph</h2>
        <button className="cancel-btn" onClick={onCancel}>×</button>
      </div>
      
      <div className="table-wrapper">
        <table className="mini-excel">
          <thead>
            <tr>
              <th className="col-id">ID</th>
              <th className="col-title">Title</th>
              <th className="col-points">Points At</th>
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="col-id">
                  <span className="id-cell">{index}</span>
                </td>
                <td className="col-title">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => handleTitleChange(index, e.target.value)}
                    placeholder="Enter title..."
                    className="title-input"
                  />
                </td>
                <td className="col-points">
                  <TagInput
                    tags={row.pointsAt}
                    onChange={(tags) => handlePointsAtChange(index, tags)}
                  />
                </td>
                <td className="col-actions">
                  {rows.length > 1 && (
                    <button 
                      className="remove-row-btn" 
                      onClick={() => handleRemoveRow(index)}
                      title="Remove row"
                    >
                      −
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-maker-footer">
        <button className="add-row-btn" onClick={handleAddRow}>
          + Add Row
        </button>
        <button className="create-btn" onClick={handleCreate}>
          Create Graph
        </button>
      </div>
    </div>
  )
}
