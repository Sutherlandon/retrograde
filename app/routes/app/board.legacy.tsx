import { redirect } from "react-router";

export async function loader({ params }: { params: { id?: string } }) {
  if (!params.id) {
    throw redirect("/app");
  }

  throw redirect(`/app/board/${params.id}`);
}
