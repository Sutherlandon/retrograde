import { Form, redirect, useActionData, type ActionFunctionArgs } from "react-router";
import { nanoid } from "nanoid";

import Header from "~/components/Header";
import { createBoard } from "~/server/board_model";
import { RocketIcon, ServerIcon, CloudIcon, AstronautIcon, ExternalLinkIcon, BookIcon, StartIcon, EmailIcon } from "~/images/icons";
import retrogradeSnapshot from "~/images/retrograde-snapshot.png";
import Button from "~/components/Button";
import Card from '~/components/Card';

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
    <div className='text-gray-100 min-h-screen'>
      <Header home />
      <div className='min-w-[390px] p-5 md:p-10 bg-gradient-to-b from-black to-sky-400'>
        <h1 className="text-4xl font-bold mb-20 mx-auto w-fit">
          Mission Control for Retrospectives
        </h1>
        <section className="flex gap-6 flex-wrap mb-20 max-w-[1200px] mx-auto">
          <div className="md:max-w-[45%] min-w-[350px] text-center mx-auto mb-6 flex flex-col justify-center">
            <section className="text-2xl text-gray-300 mb-10">
              Reflect, align, and launch your next sprint with clarity and momentum using Retrograde,
              the agile retrospective and idea board for productive teams.
            </section>
            <div className="mb-10">
              <Button
                as='a'
                href="/board/example-board"
                text="Try the tutorial"
                className="mx-auto  px-4 py-2"
                style={{ width: 'fit-content' }}
                icon={<BookIcon />}
                variant="outline"
              />
            </div>
          </div>
          <div id='create-form' className="p-10 bg-slate-800 rounded shadow-md max-w-md mx-auto text-gray-100 text-center min-w-[350px] md:max-w-[45%]">
            <h2 className="text-2xl font-bold mb-4">Create a New Board</h2>
            <Form method="post" className="mb-4">
              <div className="mb-4">
                <label htmlFor='title' className="text-lg font-bold text-left block mb-2">Title</label>
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
                <div className='mx-auto w-fit'>
                  <a href='/Retrograde_Terms_of_Service.pdf' target='_blank' className="text-sm text-blue-400 underline">
                    Terms of Service
                  </a> & <a href='/Retrograde_Privacy_Policy.pdf' target='_blank' className="text-sm text-blue-400 underline">
                    Privacy Policy
                  </a>
                </div>
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
          <h2 className="text-2xl px-5 mb-10 max-w-[800px] mx-auto ">
            Empower each crew member to share insights - turning retros into real
            conversations that move your mission forward.
          </h2>
          <div className="bg-gray-900 p-4 rounded max-w-[900px] mx-auto shadow-md">
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
            <Card
              Icon={CloudIcon}
              title='Saas Solution'
              text='Let us handle the infrastructure. Our cloud-hosted solution ensures your boards are always accessible, secure, and scalable without any hassle on your part.'
              buttonProps={{
                text: 'Create your first board',
                icon: <StartIcon />,
                iconPosition: 'right',
                onClick: () => {
                  const el = document.getElementById("create-form");
                  const y = el!.getBoundingClientRect().top + window.scrollY;

                  window.scrollTo({
                    top: y - 16,   // 1rem offset
                    behavior: "smooth"
                  });
                }
              }}
            />
            <Card
              Icon={AstronautIcon}
              title="Self-Hosting"
              text="Want to self-host? Deploy the app on your own servers for full control, and our team can help you get started or customize your setup as needed."
              buttonProps={{
                as: 'a',
                href: 'mailto:support@retrograde.sh?subject=Self-Hosting%20Inquiry',
                text: 'Contact Us',
                icon: <EmailIcon />,
                iconPosition: 'right',
              }}
            />
            {/* <Card
              Icon={AstronautIcon}
              title="Consulting"
              text="Need help getting started or customizing your setup? Our team of experts is here to assist you with tailored solutions that fit your team's unique needs."
              buttonProps={{
                as: 'a',
                href: '/contact',
                text: 'Contact Us',
                icon: <EmailIcon />,
                iconPosition: 'right',
              }}
            /> */}
          </div>
        </section >
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
      </div >
    </div>
  );
}
