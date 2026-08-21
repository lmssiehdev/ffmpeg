import type { SVGProps } from "react"

export function WorkspaceMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M2 4h7l7 8-7 8H2l7-8z" fill="currentColor" />
      <path d="M10 4h5l7 8-7 8h-5l7-8z" fill="currentColor" opacity="0.42" />
    </svg>
  )
}
