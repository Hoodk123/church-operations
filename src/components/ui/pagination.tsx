import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationButtonProps = {
  isActive?: boolean
  disabled?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"button">

function PaginationButton({
  className,
  isActive,
  size = "icon",
  disabled,
  children,
  ...props
}: PaginationButtonProps) {
  return (
    <Button
      variant={isActive ? "outline" : "ghost"}
      size={size}
      disabled={disabled}
      type="button"
      className={cn("gap-1", className)}
      {...(props as any)}
    >
      {children}
    </Button>
  )
}

function PaginationPrevious({
  className,
  disabled,
  ...props
}: React.ComponentProps<"button"> & { disabled?: boolean }) {
  return (
    <PaginationButton
      aria-label="Go to previous page"
      size="default"
      disabled={disabled}
      className={cn("gap-1 pl-2.5", className)}
      {...(props as any)}
    >
      <ChevronLeftIcon />
      <span>Previous</span>
    </PaginationButton>
  )
}

function PaginationNext({
  className,
  disabled,
  ...props
}: React.ComponentProps<"button"> & { disabled?: boolean }) {
  return (
    <PaginationButton
      aria-label="Go to next page"
      size="default"
      disabled={disabled}
      className={cn("gap-1 pr-2.5", className)}
      {...(props as any)}
    >
      <span>Next</span>
      <ChevronRightIcon />
    </PaginationButton>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationButton,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
