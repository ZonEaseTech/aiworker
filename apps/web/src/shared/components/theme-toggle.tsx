import type { LucideIcon } from 'lucide-react'
import type { Theme } from '@/shared/stores/theme'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip'
import { useThemeStore } from '@/shared/stores/theme'

const THEME_ORDER: Theme[] = ['system', 'light', 'dark']

const THEME_LABELS: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
}

const THEME_ICONS = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} satisfies Record<Theme, LucideIcon>

function getNextTheme(theme: Theme) {
  const nextIndex = (THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length
  return THEME_ORDER[nextIndex] ?? 'system'
}

export function ThemeToggle() {
  const theme = useThemeStore(s => s.theme)
  const setTheme = useThemeStore(s => s.setTheme)
  const Icon = THEME_ICONS[theme]
  const label = THEME_LABELS[theme]

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            aria-label={`Theme: ${label}`}
            size="icon"
            variant="ghost"
            onClick={() => setTheme(getNextTheme(theme))}
          >
            <Icon className="size-4" />
          </Button>
        )}
      />
      <TooltipContent>
        Theme:
        {' '}
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
