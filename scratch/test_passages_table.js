import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ecqhgdpxlrnnfgswxbro.supabase.co';
const supabaseAnonKey = 'sb_publishable_2NMlI-TV8Eb1aMjI_r7ZFQ_w6j0uJo-';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testPassages() {
  const res = await supabase.from('reading_exam_passages').select('*').limit(1);
  console.log('reading_exam_passages result:', res);
}

testPassages();

