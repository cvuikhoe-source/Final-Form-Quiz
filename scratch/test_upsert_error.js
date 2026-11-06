import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ecqhgdpxlrnnfgswxbro.supabase.co';
const supabaseAnonKey = 'sb_publishable_2NMlI-TV8Eb1aMjI_r7ZFQ_w6j0uJo-';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUpsert() {
  const dummyRow = {
    id: 'test_reading_upsert_1',
    lesson_id: 'lexam_1793549530485_362iw',
    question_no: 1,
    question_type: 'multiple_choice',
    question_text: 'Test question',
    option_a: 'A',
    option_b: 'B',
    option_c: 'C',
    option_d: 'D',
    correct_answer: 'A',
    time_seconds: 30,
    answer_explanation: 'Test explanation',
    vocabulary_han_viet: '', // empty string instead of null!
    sort_order: 1,
    active: true,
  };

  const res = await supabase.from('exam_questions').upsert([dummyRow], { onConflict: 'id' });
  console.log('Upsert result with empty string:', res);

  // cleanup
  await supabase.from('exam_questions').delete().eq('id', 'test_reading_upsert_1');
}

testUpsert();
