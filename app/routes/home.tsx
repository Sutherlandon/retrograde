import { Form, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { nanoid } from "nanoid";

import Header from "~/components/Header";
import { createBoard } from "~/server/board_model";
import { RocketIcon, ServerIcon, CloudIcon, AstronautIcon } from "~/images/icons";
import retrogradeSnapshot from "~/images/retrograde-snapshot.png";

export const meta = () => {
  return [
    { title: "Retrograde – Agile Retrospective & Idea Boards" },
    {
      name: "description",
      content:
        "Run fun, productive retrospectives with Retrograde — the mission control for your agile team. Create idea boards, collect feedback, and launch better sprints.",
    },
    { name: "keywords", content: "agile retrospective tool, scrum retrospectives, idea board, sprint review, team feedback, retro board" },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: "Retrograde – Mission Control for Retrospectives" },
    {
      property: "og:description",
      content: "Reflect, align, and launch your next sprint with clarity and momentum.",
    },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://retrograde.sh/" },
    { property: "og:image", content: "https://retrorade.sh/retrograde-snapshot.png" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Retrograde – Mission Control for Retrospectives" },
    {
      name: "twitter:description",
      content: "Reflect, align, and launch your next sprint with clarity and momentum.",
    },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const data = await request.formData();
  const title = data.get("title")?.toString().trim();
  const no_jerks = data.get("no_jerks");

  const errors: Record<string, string> = {};

  // validate the form data
  if (!title || title.length < 3) {
    errors.title = "Title must be at least 3 characters.";
  }

  // check if they agreed to the kindness checkbox
  if (!no_jerks) {
    errors.no_jerks = "You must agree to the kindness checkbox.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, status: 400 };
  }

  // generate a unique board ID
  const board_id = nanoid();

  // create the board in the database
  await createBoard(board_id, title!);

  // redirect to the new board
  return redirect(`/board/${board_id}`);
}

export default function Home() {
  const actionData = useActionData<{ errors?: Record<string, string> }>();

  return (
    <>
      <Header />
      <div className='min-w-[390px] p-5 md:p-10 bg-gradient-to-b from-black to-sky-400'>
        <section className="flex gap-6 flex-wrap mb-20 max-w-[1200px] mx-auto">
          <div className="max-w-[600px] min-w-[350px] text-center mx-auto mb-6 flex flex-col justify-center">
            <h1 className="text-4xl font-bold mb-6">
              Mission control for retrospectives
            </h1>
            <section className="text-2xl text-gray-300">
              Reflect, align, and launch your next sprint with clarity and momentum using Retrograde,
              the agile retrospective and idea board for productive teams.
            </section>
          </div>
          <div className="p-10 bg-slate-800 rounded shadow-md max-w-md mx-auto text-gray-100 text-center min-w-[350px] max-w-[600px]">
            <h2 className="text-2xl font-bold mb-4">Create a New Board</h2>
            <Form method="post" className="mb-4">
              <div className="mb-4">
                <label htmlFor='title' className="text-lg font-bold text-left block">Title</label>
                <input type='text' id='title' name='title' placeholder="Board Title" className="p-2 w-full border rounded" />
                {actionData?.errors?.title && (
                  <p className="text-red-500 text-sm mt-1 text-left">
                    {actionData.errors.title}
                  </p>
                )}
              </div>
              <div className="mb-4 text-left">
                <input type="checkbox" id="no_jerks" name="no_jerks" className="mr-2" />
                <label htmlFor="no_jerks">I will treat other's the way I want to be treated.</label>
                {actionData?.errors?.no_jerks && (
                  <p className="text-red-500 text-sm mt-1 text-left">
                    {actionData.errors.no_jerks}
                  </p>
                )}
              </div>
              <div className="mb-4">
                <button
                  type="submit"
                  name="type"
                  value="addColumn"
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded hover:from-green-800 hover:to-blue-800 hover:cursor-pointer flex items-center justify-center m-auto"
                >
                  Create Board <RocketIcon size="md" className="ml-2" />
                </button>
              </div>
            </Form>
          </div>
        </section>
        <section className="text-center mb-20">
          <h2 className="text-2xl px-5 mb-20 max-w-[800px] mx-auto ">
            Empower each crew member to speak up and share insights -
            turning retros into real conversations that move your mission forward.
          </h2>
          <div className="bg-gray-900 p-4 rounded">
            <img
              src={retrogradeSnapshot}
              alt="Schemantics Retrograde Diagram"
              className="mx-auto max-w-full h-auto shadow-md"
            />
          </div>
        </section>
        <section className="text-center mb-10">
          <h2 className="text-3xl px-5 mb-10 max-w-[800px] mx-auto font-bold">
            Hosted Anywhere
          </h2>
          <div className="flex flex-col md:flex-row gap-6 justify-center max-w-[900px] mx-auto mb-20">
            <div className="bg-gray-900 p-4 rounded-lg">
              <CloudIcon className="h-25 w-25 mb-4 mx-auto" />
              <h3 className="text-xl font-bold mb-2">Cloud Hosting</h3>
              <p>
                Let us handle the infrastructure. Our cloud-hosted solution ensures your boards are always accessible,
                secure, and scalable without any hassle on your part.
              </p>
            </div>
            <div className="bg-gray-900 p-4 rounded-lg">
              <ServerIcon className="h-25 w-25 mb-4 mx-auto" />
              <h3 className="text-xl font-bold mb-2">Self-Hosting</h3>
              <p>
                Prefer to keep things in-house? No problem. Download our application and deploy it on your own servers
                for complete control over your data and environment.
              </p>
            </div>
            <div className="bg-gray-900 p-4 rounded-lg">
              <AstronautIcon className="h-25 w-25 mb-4 mx-auto" />
              <h3 className="text-xl font-bold mb-2">Consulting</h3>
              <p>
                Need help getting started or customizing your setup? Our team of experts is here to assist you with
                tailored solutions that fit your team's unique needs.
              </p>
            </div>
          </div>
        </section>
        <section className="mx-auto text-center flex gap-2 items-center justify-center text-slate-800">
          <span>Built by <a
            href="https://sutherlandon.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Sutherlandon
          </a> with</span>
          <RocketIcon size="xl" />
        </section>
      </div>
    </>
  );
}
