import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-transparent text-sm font-semibold whitespace-nowrap transition-[transform,background-color,box-shadow,border-color] duration-200 outline-none select-none hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-moss/40 disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-pine text-paper shadow-[0_5px_14px_rgba(20,62,48,0.12)] hover:bg-pine-hover hover:shadow-[0_9px_19px_rgba(20,62,48,0.18)]",
        lime: "bg-leaf-bright text-pine-deep hover:bg-[#daf7a7]",
        outline: "border-line bg-paper text-ink hover:border-line-strong hover:bg-white",
        secondary: "bg-wash text-ink hover:bg-[#e6e9dc]",
        ghost: "text-ink hover:translate-y-0 hover:bg-wash",
        glass: "border-white/35 bg-white/10 text-white hover:bg-white/20",
        destructive: "border-danger-bg bg-danger-bg text-danger-fg hover:border-[#f2c8bd]",
        link: "px-0 text-moss underline-offset-4 hover:translate-y-0 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 px-5 text-[0.9375rem]",
        icon: "size-10",
        "icon-sm": "size-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
