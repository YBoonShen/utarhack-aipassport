// React access to the training records, kept current while a page is open.
//
// An admin publishing or assigning a module happens in a different browser
// session from the employee who receives it, so neither side can rely on its
// own state being the latest. Both subscribe to the same cached snapshot and
// re-read it on a slow poll and whenever the tab is looked at again — which is
// what turns "the admin assigned it" into "the employee sees it" with no manual
// reload anywhere.
import { useEffect, useState } from 'react'
import { getSnapshot, refreshTraining, subscribe } from './trainingStore.js'

const POLL_MS = 5000

function useTrainingSnapshot() {
  const [snap, setSnap] = useState(getSnapshot)

  useEffect(() => {
    const off = subscribe(setSnap)
    refreshTraining()
    const onFocus = () => refreshTraining()
    window.addEventListener('focus', onFocus)
    const timer = setInterval(refreshTraining, POLL_MS)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [])

  return snap
}

/** The admin's view: the whole library plus every assignment record. */
export function useTrainingLibrary() {
  const snap = useTrainingSnapshot()
  return {
    modules: snap.library,
    assignments: snap.assignments,
    maxQuestions: snap.maxQuestions,
    loaded: snap.loaded,
    refresh: refreshTraining,
  }
}

/**
 * The employee's view: only the modules actually assigned to them.
 *
 * `loaded` matters — an empty list before the first answer arrives is "still
 * loading", not "you have no training", and the two must not look the same.
 */
export function useAssignedModules() {
  const snap = useTrainingSnapshot()
  return {
    modules: snap.mine,
    assignments: snap.myAssignments,
    employeeId: snap.employeeId,
    loaded: snap.loaded,
    refresh: refreshTraining,
  }
}
