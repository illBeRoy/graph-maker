import './GeminiLandingPage.css'

export function GeminiLandingPage() {
  const handleShowMoreOptions = () => {
    window.location.hash = ''
  }

  return (
    <div className="gemini-landing">
      <div className="gemini-landing-icon">✨</div>
      <h1 className="gemini-landing-title">Welcome back</h1>
      <p className="gemini-landing-message">
        Paste the data you got from Gemini here
      </p>
      <div className="gemini-landing-hint">
        <span className="kbd">⌘V</span> or <span className="kbd">Ctrl+V</span>
      </div>
      <button className="gemini-more-options" onClick={handleShowMoreOptions}>
        Show more options
      </button>
    </div>
  )
}
