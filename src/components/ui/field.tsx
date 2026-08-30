import { Field as FieldPrimitive } from "@base-ui/react/field"

import { cn } from "@/lib/utils"

const Field = FieldPrimitive.Root

function FieldLabel({
  className,
  ...props
}: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        "mb-1 block text-sm font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function FieldError({
  className,
  ...props
}: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn(
        "mt-1 block text-xs text-destructive",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({
  className,
  ...props
}: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn(
        "mt-1 block text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldLabel, FieldError, FieldDescription }
