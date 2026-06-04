from __future__ import annotations

import html
import textwrap
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.models.property import Client, Property
from app.models.work_order import WorkOrder


@dataclass(frozen=True)
class QuotePackage:
    text_body: str
    html_body: str
    pdf_filename: str
    pdf_bytes: bytes


def is_quote_request(title: str, description: Optional[str]) -> bool:
    haystack = f"{title}\n{description or ''}".lower()
    return any(keyword in haystack for keyword in ("quote", "estimate", "quotation"))


def _extract_tasks(title: str, description: Optional[str]) -> list[str]:
    tasks: list[str] = []
    if description:
        for raw_line in description.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line[:2] in ("- ", "* "):
                tasks.append(line[2:].strip())
                continue
            if len(line) > 2 and line[0].isdigit() and line[1] in (".", ")"):
                tasks.append(line[2:].strip())
                continue
            tasks.append(line)

    if not tasks:
        tasks.append(title)

    return [task for task in tasks if task]


def build_quote_document(
    *,
    client: Client,
    property: Optional[Property],
    work_order: WorkOrder,
) -> str:
    tasks = _extract_tasks(work_order.title, work_order.description)
    created_at = work_order.created_at or datetime.now(timezone.utc)
    property_address = property.address if property is not None else "Not provided"
    property_zone = property.zone if property is not None and property.zone else "Not provided"

    lines = [
        "LawnCraft Detailed Quote",
        f"Quote reference: WO-{work_order.id:06d}",
        f"Prepared on: {created_at.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "Customer Details",
        f"Name: {client.full_name}",
        f"Email: {client.email or 'Not provided'}",
        f"Phone: {client.phone or 'Not provided'}",
        "",
        "Property Details",
        f"Address: {property_address}",
        f"Zone: {property_zone}",
        "",
        "Requested Scope",
        f"Summary: {work_order.title}",
    ]

    if work_order.description:
        lines.extend([
            "",
            "Request Notes",
            work_order.description.strip(),
        ])

    lines.extend([
        "",
        "Task Breakdown",
    ])
    for index, task in enumerate(tasks, start=1):
        lines.append(f"{index}. {task}")

    lines.extend([
        "",
        "Quote Notes",
        "- Pricing is subject to final site inspection and material selection.",
        "- If additional tasks are requested on site, the scope should be updated before work begins.",
        "- Reply to this email to approve the quote or request changes.",
    ])

    return "\n".join(lines)


def build_quote_html_document(
        *,
        client: Client,
        property: Optional[Property],
        work_order: WorkOrder,
) -> str:
        tasks = _extract_tasks(work_order.title, work_order.description)
        created_at = work_order.created_at or datetime.now(timezone.utc)
        property_address = property.address if property is not None else "Not provided"
        property_zone = property.zone if property is not None and property.zone else "Not provided"

        task_items = "".join(f"<li>{html.escape(task)}</li>" for task in tasks)
        notes_block = ""
        if work_order.description:
                notes_block = f"""
                <section>
                    <h2>Request Notes</h2>
                    <pre>{html.escape(work_order.description.strip())}</pre>
                </section>
                """

        return f"""<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <style>
            body {{ font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; }}
            .page {{ max-width: 760px; margin: 0 auto; padding: 24px; }}
            h1 {{ margin-bottom: 0.25rem; }}
            h2 {{ margin-top: 1.5rem; margin-bottom: 0.5rem; }}
            .meta {{ color: #6b7280; margin-top: 0; }}
            .card {{ background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }}
            ul {{ margin-top: 0.5rem; }}
            pre {{ white-space: pre-wrap; font-family: inherit; margin: 0; }}
        </style>
    </head>
    <body>
        <main class="page">
            <h1>LawnCraft Detailed Quote</h1>
            <p class="meta">Quote reference: WO-{work_order.id:06d} | Prepared on: {created_at.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>

            <section class="card">
                <h2>Customer Details</h2>
                <p><strong>Name:</strong> {html.escape(client.full_name)}</p>
                <p><strong>Email:</strong> {html.escape(client.email or 'Not provided')}</p>
                <p><strong>Phone:</strong> {html.escape(client.phone or 'Not provided')}</p>
            </section>

            <section class="card">
                <h2>Property Details</h2>
                <p><strong>Address:</strong> {html.escape(property_address)}</p>
                <p><strong>Zone:</strong> {html.escape(property_zone)}</p>
            </section>

            <section class="card">
                <h2>Requested Scope</h2>
                <p><strong>Summary:</strong> {html.escape(work_order.title)}</p>
            </section>

            {notes_block}

            <section class="card">
                <h2>Task Breakdown</h2>
                <ol>{task_items}</ol>
            </section>

            <section class="card">
                <h2>Quote Notes</h2>
                <ul>
                    <li>Pricing is subject to final site inspection and material selection.</li>
                    <li>If additional tasks are requested on site, the scope should be updated before work begins.</li>
                    <li>Reply to this email to approve the quote or request changes.</li>
                </ul>
            </section>
        </main>
    </body>
</html>"""


def _escape_pdf_text(value: str) -> str:
        return value.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _wrap_pdf_lines(lines: list[str], width: int = 92) -> list[str]:
        wrapped: list[str] = []
        for line in lines:
                if not line:
                        wrapped.append("")
                        continue
                wrapped.extend(textwrap.wrap(line, width=width, break_long_words=False, break_on_hyphens=False) or [""])
        return wrapped


def build_quote_pdf_document(
        *,
        client: Client,
        property: Optional[Property],
        work_order: WorkOrder,
) -> bytes:
        text_body = build_quote_document(client=client, property=property, work_order=work_order)
        lines = _wrap_pdf_lines(text_body.splitlines())

        content_lines = ["BT", "/F1 10 Tf", "72 760 Td"]
        for index, line in enumerate(lines):
                if index > 0:
                        content_lines.append("0 -14 Td")
                content_lines.append(f"({_escape_pdf_text(line)}) Tj")
        content_lines.append("ET")

        stream = "\n".join(content_lines).encode("latin-1", "replace")

        objects: list[bytes] = []

        def add_object(content: str | bytes) -> None:
                if isinstance(content, str):
                        objects.append(content.encode("latin-1"))
                else:
                        objects.append(content)

        add_object("<< /Type /Catalog /Pages 2 0 R >>")
        add_object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
        add_object(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        )
        add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        add_object(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream")

        pdf = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
                offsets.append(len(pdf))
                pdf.extend(f"{index} 0 obj\n".encode("ascii"))
                pdf.extend(obj)
                pdf.extend(b"\nendobj\n")

        xref_offset = len(pdf)
        pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
                pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        pdf.extend(
                (
                        "trailer\n"
                        f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
                        f"startxref\n{xref_offset}\n"
                        "%%EOF\n"
                ).encode("ascii")
        )

        return bytes(pdf)


def build_quote_package(
        *,
        client: Client,
        property: Optional[Property],
        work_order: WorkOrder,
) -> QuotePackage:
        return QuotePackage(
                text_body=build_quote_document(client=client, property=property, work_order=work_order),
                html_body=build_quote_html_document(client=client, property=property, work_order=work_order),
                pdf_filename=f"quote-wo-{work_order.id:06d}.pdf",
                pdf_bytes=build_quote_pdf_document(client=client, property=property, work_order=work_order),
        )