'use client'

import * as React from 'react'

/** Set by AppShellSidebar so NavItem knows whether it can be in a rail. */
export const SidebarContext = React.createContext<{ collapsible: boolean }>({ collapsible: false })
