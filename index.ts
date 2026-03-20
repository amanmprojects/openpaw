import { createCliRenderer, TextRenderable, BoxRenderable, InputRenderable, InputRenderableEvents, SelectRenderable, SelectRenderableEvents, TextAttributes } from "@opentui/core"

async function main() {
  const renderer = await createCliRenderer()

  const container = new BoxRenderable(renderer, {
    id: "form-container",
    flexDirection: "column",
    gap: 1,
    padding: 2,
    width: 50,
    border: true,
    borderColor: "#4488ff",
  })

  const title = new TextRenderable(renderer, {
    id: "title",
    content: "Contact Form",
    fg: "#4488ff",
    attributes: TextAttributes.BOLD,
  })

  const nameLabel = new TextRenderable(renderer, {
    id: "name-label",
    content: "Name:",
  })

  const nameInput = new InputRenderable(renderer, {
    id: "name-input",
    placeholder: "Enter your name",
    width: 30,
  })

  const emailLabel = new TextRenderable(renderer, {
    id: "email-label",
    content: "Email:",
  })

  const emailInput = new InputRenderable(renderer, {
    id: "email-input",
    placeholder: "Enter your email",
    width: 30,
  })

  const typeLabel = new TextRenderable(renderer, {
    id: "type-label",
    content: "Inquiry Type:",
  })

  const typeSelect = new SelectRenderable(renderer, {
    id: "type-select",
    options: [
      { name: "General", description: "General questions" },
      { name: "Support", description: "Technical support" },
      { name: "Sales", description: "Sales inquiries" },
    ],
    width: 30,
    height: 4,
  })

  typeSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index, option) => {
    console.log("Selected type:", option.name)
  })

  nameInput.focus()

  container.add(title)
  container.add(nameLabel)
  container.add(nameInput)
  container.add(emailLabel)
  container.add(emailInput)
  container.add(typeLabel)
  container.add(typeSelect)

  renderer.root.add(container)
}

main()
