import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ecqhgdpxlrnnfgswxbro.supabase.co';
const supabaseAnonKey = 'sb_publishable_2NMlI-TV8Eb1aMjI_r7ZFQ_w6j0uJo-';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('exam_questions').select('*').limit(1);
  console.log('Query result:', data, error);
}

check();

