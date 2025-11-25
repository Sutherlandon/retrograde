import type { JSX } from 'react'
import Button, { type ButtonProps } from "./Button";

export default function Card({
  buttonProps,
  text,
  title,
  Icon,
}: {
  buttonProps: ButtonProps;
  text: string;
  title: string;
  Icon: JSX.Element;
  link: string;
}) {
  return (
    <div className="bg-gray-900 p-4 rounded-lg max-w-84 mx-auto">
      <Icon className="h-25 w-25 mb-4 mx-auto" />
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <div className="mb-5">{text}</div>
      <Button {...buttonProps} className={`${buttonProps?.className} mx-auto py-2 px-4`} />
    </div>
  )
}