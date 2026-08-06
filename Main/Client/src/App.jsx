import { ProjectProvider } from './project/ProjectContext.jsx'
import Shell from './components/Shell.jsx'

export default function App() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  )
}
