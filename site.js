const nav = document.querySelector(".nav");
const menuButton = document.querySelector(".menu-button");
const navLinks = document.querySelector(".nav-links");

document.getElementById("year").textContent = new Date().getFullYear();
addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 20), { passive: true });
menuButton.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", open);
});
navLinks.addEventListener("click", () => {
  navLinks.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: .1 });
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

const contactForm = document.getElementById("contact-form");
const formStatus = document.getElementById("form-status");
contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = contactForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Sending...";
  formStatus.className = "form-status";
  formStatus.textContent = "";
  try {
    const response = await fetch(contactForm.dataset.endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(contactForm)
    });
    if (!response.ok) throw new Error("Request failed");
    contactForm.reset();
    formStatus.className = "form-status success";
    formStatus.textContent = "Message sent. We will be in touch.";
  } catch (error) {
    formStatus.className = "form-status error";
    formStatus.textContent = "Message could not be sent. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Send message ↗";
  }
});
