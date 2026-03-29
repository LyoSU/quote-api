const NAME_COLORS_LIGHT = [
  '#FC5C51', '#FA790F', '#895DD5', '#0FB297', '#0FC9D6', '#3CA5EC', '#D54FAF'
]

const NAME_COLORS_DARK = [
  '#FF8E86', '#FFA357', '#B18FFF', '#4DD6BF', '#45E8D1', '#7AC9FF', '#FF7FD5'
]

const AVATAR_COLORS = [
  ['#FF885E', '#FF516A'], ['#FFCD6A', '#FFA85C'], ['#E0A2F3', '#D669ED'],
  ['#A0DE7E', '#54CB68'], ['#53EDD6', '#28C9B7'], ['#72D5FD', '#2A9EF1'],
  ['#FFA8A8', '#FF719A']
]

const BREAK_REGEX = /<br>|\n|\r/
const SPACE_REGEX = /[\f\n\r\t\v\u0020\u1680\u2000-\u200a\u2028\u2029\u205f\u3000]/
const CJK_REGEX = /[\u1100-\u11ff\u2e80-\u2eff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3130-\u318f\u3190-\u319f\u31a0-\u31bf\u31c0-\u31ef\u31f0-\u31ff\u3200-\u32ff\u3300-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/
const RTL_REGEX = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/
const NEUTRAL_REGEX = /[\u0001-\u0040\u005B-\u0060\u007B-\u00BF\u00D7\u00F7\u02B9-\u02FF\u2000-\u2BFF\u2010-\u2029\u202C\u202F-\u2BFF\u1F300-\u1F5FF\u1F600-\u1F64F]/

const ENTITY_TYPES_MONOSPACE = ['pre', 'code', 'pre_code']
const ENTITY_TYPES_MENTION = ['mention', 'text_mention', 'hashtag', 'email', 'phone_number', 'bot_command', 'url', 'text_link']

module.exports = {
  NAME_COLORS_LIGHT, NAME_COLORS_DARK, AVATAR_COLORS,
  BREAK_REGEX, SPACE_REGEX, CJK_REGEX, RTL_REGEX, NEUTRAL_REGEX,
  ENTITY_TYPES_MONOSPACE, ENTITY_TYPES_MENTION
}
