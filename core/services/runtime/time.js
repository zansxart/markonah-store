export async function time() {
  let d = new Date(new Date() + 3600000)
  let locale = 'id'
  let hari = d.toLocaleDateString(locale, { weekday: 'long' })
  let tgl = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const jam = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Jakarta" })
  return `${hari}, ${tgl}, ${jam}`
}
