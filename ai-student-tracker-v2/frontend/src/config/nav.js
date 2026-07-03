/** Route titles for Navbar + defaults */
export const ROUTE_META = {
  '/': {
    title: 'Dashboard',
    subtitle: 'AI-powered class overview, risks, and quick actions',
  },
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'AI-powered class overview, risks, and quick actions',
  },
  '/student-dashboard': {
    title: 'My dashboard',
    subtitle: 'Your academic standing at a glance',
  },
  '/my': {
    title: 'My dashboard',
    subtitle: 'Your academic standing at a glance',
  },
  '/students': {
    title: 'Students',
    subtitle: 'Search, manage, and open student profiles',
  },
  '/subjects': {
    title: 'Subjects',
    subtitle: 'Manage the curriculum catalog',
  },
  '/scores': {
    title: 'Add scores',
    subtitle: 'Enter exam results across subjects in one flow',
  },
  '/bulk': {
    title: 'Bulk upload',
    subtitle: 'Import scores or students from Excel / CSV',
  },
  '/attend': {
    title: 'Attendance',
    subtitle: 'Mark daily attendance for the whole class',
  },
  '/reports': {
    title: 'AI reports',
    subtitle: 'Generate narrative feedback with ML risk context',
  },
  '/analytics': {
    title: 'Analytics',
    subtitle: 'Grade spread, risk mix, and class health',
  },
  '/audit': {
    title: 'Audit log',
    subtitle: 'Security and compliance event stream',
  },
  '/settings': {
    title: 'ML & registry',
    subtitle: 'Model training and checkpoint status',
  },
  '/messages': {
    title: 'Messages',
    subtitle: 'Chat with teachers and students',
  },
  '/notifications': {
    title: 'Notifications',
    subtitle: 'Your in-app inbox',
  },
  '/alerts': {
    title: 'Alert history',
    subtitle: 'Parent email/SMS alerts dispatched automatically',
  },
  '/unauthorized': {
    title: 'Access denied',
    subtitle: 'Your account role does not allow this page',
  },
}

export function metaForPath(pathname) {
  if (pathname.startsWith('/students/') && pathname !== '/students') {
    return {
      title: 'Student profile',
      subtitle: 'Scores, attendance, AI prediction, and report',
    }
  }
  if (pathname.startsWith('/messages/')) {
    return ROUTE_META['/messages']
  }
  return ROUTE_META[pathname] || { title: 'AI Student Tracker', subtitle: '' }
}
