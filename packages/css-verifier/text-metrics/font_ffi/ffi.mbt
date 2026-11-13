// Thin build-time FFI over mizchi/font. Decisions (bounds, rounding, CSS
// consistency) live in JS; this file only parses fonts and shapes text.

///|
let fonts : Array[@font.TTFont] = []

///|
/// Parse TTF/OTF/WOFF/WOFF2 bytes. Returns a handle, or -1 when unparsable.
pub fn load_font(data : Bytes) -> Int {
  match @font.parse_font(data) {
    Some(font) => {
      fonts.push(font)
      fonts.length() - 1
    }
    None => -1
  }
}

///|
pub fn font_info(handle : Int) -> String {
  guard handle >= 0 && handle < fonts.length() else {
    return "{\"error\":\"invalid font handle\"}"
  }
  let font = fonts[handle]
  let names : Map[String, Json] = Map([])
  font.name_records.each(fn(id, name) { names[id.to_string()] = Json::string(name) })
  let axes : Array[Json] = font.var_axes.map(fn(axis) {
    {
      "tag": Json::string(axis.tag),
      "min": Json::number(axis.min_value),
      "default": Json::number(axis.default_value),
      "max": Json::number(axis.max_value),
    }
  })
  let os2 : Json = match font.os2 {
    Some(t) =>
      {
        "fsSelection": Json::number(t.fs_selection.to_double()),
        "typoAscender": Json::number(t.s_typo_ascender.to_double()),
        "typoDescender": Json::number(t.s_typo_descender.to_double()),
        "typoLineGap": Json::number(t.s_typo_line_gap.to_double()),
        "winAscent": Json::number(t.us_win_ascent.to_double()),
        "winDescent": Json::number(t.us_win_descent.to_double()),
      }
    None => Json::null()
  }
  let out : Json = {
    "unitsPerEm": Json::number(font.units_per_em.to_double()),
    "ascent": Json::number(font.ascent.to_double()),
    "descent": Json::number(font.descent.to_double()),
    "lineGap": Json::number(font.line_gap.to_double()),
    "glyphs": Json::number(font.num_glyphs.to_double()),
    "names": Json::object(names),
    "axes": Json::array(axes),
    "os2": os2,
  }
  out.stringify()
}

///|
/// Shape `text` at `size` px with OpenType features (kerning and ligatures
/// on, as in CSS defaults). `axes` is a JSON object of variation coordinates;
/// `language` is the content language used for locl.
pub fn shape(
  handle : Int,
  text : String,
  size : Double,
  axes : String,
  language : String,
) -> String {
  guard handle >= 0 && handle < fonts.length() else {
    return "{\"error\":\"invalid font handle\"}"
  }
  let coordinates : Map[String, Double] = Map([])
  let parsed : Json? = try Some(@json.parse(axes)) catch { _ => None }
  if parsed is Some(Object(entries)) {
    entries.each(fn(tag, value) {
      if value is Number(v, ..) {
        coordinates[tag] = v
      }
    })
  }
  // `language` selects locl substitutions (BCP 47, "und" when unknown).
  let shaped = fonts[handle].shape_text(text, size, language~, axis_values=coordinates) catch {
    _ => return "{\"error\":\"shaping failed\"}"
  }
  shaped.to_json().stringify()
}
